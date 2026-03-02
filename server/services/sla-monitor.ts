import cron from "node-cron";
import { pool } from "../db";
import { sendWhatsAppMessage } from "./twilio";

let io: any = null;

export function initSlaMonitor(socketIo: any) {
  io = socketIo;

  cron.schedule("*/5 * * * *", async () => {
    console.log("[SLA] Running payment SLA check...");
    try {
      await pool.query("RESET ROLE");

      const tenants = await pool.query(`SELECT id FROM tenants`);

      for (const tenant of tenants.rows) {
        try {
          await processTenantSla(tenant.id);
        } catch (tenantErr) {
          console.error(`[SLA] Error processing tenant ${tenant.id}:`, tenantErr);
        }
      }
    } catch (err) {
      console.error("[SLA] Monitor error:", err);
    }
  });

  console.log("[SLA] Payment SLA monitor started (every 5 minutes)");
}

async function processTenantSla(tenantId: string) {
  const pendingPayments = await pool.query(`
    SELECT p.id, p.tenant_id, p.customer_phone, p.amount, p.currency, p.created_at,
           p.conversation_id, c.name as customer_name
    FROM ai_payments p
    LEFT JOIN conversations conv ON p.conversation_id = conv.id AND conv.tenant_id = $1
    LEFT JOIN contacts c ON conv.contact_id = c.id AND c.tenant_id = $1
    WHERE p.tenant_id = $1 AND p.status = 'pending'
    AND p.created_at < NOW() - INTERVAL '20 minutes'
  `, [tenantId]);

  for (const payment of pendingPayments.rows) {
    const existingCustomerAlert = await pool.query(`
      SELECT 1 FROM ai_sla_alerts 
      WHERE payment_id = $1 AND type = 'customer_reassurance' AND resolved = false AND tenant_id = $2
    `, [payment.id, tenantId]);

    if (existingCustomerAlert.rows.length > 0) continue;

    if (payment.customer_phone) {
      try {
        const phone = payment.customer_phone.startsWith("whatsapp:") 
          ? payment.customer_phone 
          : payment.customer_phone;
        await sendWhatsAppMessage(phone, "نحن نعمل على تأكيد حوالتك، شكراً لصبرك");
      } catch (e) {
        console.error("[SLA] Failed to send customer reassurance:", e);
      }
    }

    await pool.query(`
      INSERT INTO ai_sla_alerts (tenant_id, payment_id, type) 
      VALUES ($1, $2, 'customer_reassurance')
    `, [tenantId, payment.id]);

    const existingAdminAlert = await pool.query(`
      SELECT 1 FROM ai_sla_alerts 
      WHERE payment_id = $1 AND type = 'admin_urgent' AND resolved = false AND tenant_id = $2
    `, [payment.id, tenantId]);

    if (existingAdminAlert.rows.length === 0) {
      const customerName = payment.customer_name || payment.customer_phone || "عميل";
      const alertMsg = `تنبيه: إيصال من ${customerName} بمبلغ ${payment.amount || "غير محدد"} ${payment.currency || "SAR"} بانتظار التأكيد منذ أكثر من 20 دقيقة`;

      if (io) {
        io.to(`tenant:${tenantId}`).emit("delay_alert", {
          type: "payment_sla",
          message: alertMsg,
          paymentId: payment.id,
        });
      }

      const admins = await pool.query(`
        SELECT phone FROM users 
        WHERE tenant_id = $1 AND role IN ('admin', 'manager') AND is_active = true AND phone IS NOT NULL
      `, [tenantId]);

      for (const admin of admins.rows) {
        if (admin.phone) {
          try {
            await sendWhatsAppMessage(admin.phone, alertMsg);
          } catch (e) {
            console.error("[SLA] Failed to send admin alert:", e);
          }
        }
      }

      await pool.query(`
        INSERT INTO ai_sla_alerts (tenant_id, payment_id, type) 
        VALUES ($1, $2, 'admin_urgent')
      `, [tenantId, payment.id]);
    }
  }

  if (pendingPayments.rows.length > 0) {
    console.log(`[SLA] Tenant ${tenantId}: processed ${pendingPayments.rows.length} overdue payments`);
  }
}
