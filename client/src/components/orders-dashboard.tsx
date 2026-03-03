import { useState, useEffect, useCallback } from "react";
import {
  Loader2, RefreshCw, Plus, ChevronLeft, X, DollarSign,
  Clock, User, Plane, Hotel, FileText, Package, Car, Map,
  MoreHorizontal, CreditCard, TrendingUp, ShoppingBag, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type OrderStatus = "new" | "collecting_info" | "waiting_employee" | "offer_sent" | "waiting_payment" | "payment_review" | "paid" | "confirmed" | "completed" | "cancelled";

type ServiceType = "flight" | "hotel" | "visa" | "package" | "transport" | "tour" | "other";

interface Order {
  id: string;
  tenantId: string;
  conversationId: string | null;
  contactId: string | null;
  serviceType: ServiceType;
  status: OrderStatus;
  assignedEmployeeId: string | null;
  amount: string | null;
  currency: string;
  paymentStatus: string;
  notes: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  contact?: { name: string; phone: string } | null;
  assignedEmployee?: { name: string } | null;
}

interface OrderDetail extends Order {
  items: OrderItem[];
  payments: OrderPayment[];
}

interface OrderItem {
  id: string;
  orderId: string;
  description: string;
  quantity: number;
  unitPrice: string | null;
  currency: string;
  vendorId: string | null;
  metadata: any;
}

interface OrderPayment {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  receiptUrl: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

interface OrderStats {
  total: number;
  new: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalRevenue: number;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  new: { label: "جديد", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  collecting_info: { label: "جمع المعلومات", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
  waiting_employee: { label: "بانتظار الموظف", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30" },
  offer_sent: { label: "تم إرسال العرض", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  waiting_payment: { label: "بانتظار الدفع", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  payment_review: { label: "مراجعة الدفع", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30" },
  paid: { label: "مدفوع", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30" },
  confirmed: { label: "مؤكد", color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30" },
  completed: { label: "مكتمل", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "ملغي", color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30" },
};

const SERVICE_ICONS: Record<ServiceType, typeof Plane> = {
  flight: Plane,
  hotel: Hotel,
  visa: FileText,
  package: Package,
  transport: Car,
  tour: Map,
  other: ShoppingBag,
};

const SERVICE_LABELS: Record<ServiceType, string> = {
  flight: "حجز طيران",
  hotel: "حجز فندق",
  visa: "تأشيرة",
  package: "باقة سياحية",
  transport: "نقل",
  tour: "جولة",
  other: "أخرى",
};

const KANBAN_COLUMNS: OrderStatus[] = [
  "new", "collecting_info", "waiting_employee", "offer_sent",
  "waiting_payment", "payment_review", "paid", "confirmed", "completed"
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `منذ ${diffHr} س`;
  return d.toLocaleDateString("ar-SA");
}

function formatCurrency(amount: string | null, currency: string = "SAR") {
  if (!amount) return "---";
  return `${parseFloat(amount).toLocaleString("ar-SA")} ${currency}`;
}

export function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const fetchOrders = useCallback(async () => {
    try {
      const [ordersRes, statsRes] = await Promise.all([
        authFetch("/api/orders"),
        authFetch("/api/orders/stats"),
      ]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/orders/${orderId}`);
      if (res.ok) {
        setSelectedOrder(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch order detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    try {
      const res = await authFetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast({ title: "تم تحديث حالة الطلب" });
        fetchOrders();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(prev => prev ? { ...prev, status } : null);
        }
      }
    } catch (err) {
      toast({ title: "خطأ في تحديث الطلب", variant: "destructive" });
    }
  }, [selectedOrder, fetchOrders, toast]);

  const getOrdersByStatus = (status: OrderStatus) =>
    orders.filter(o => o.status === status);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="orders-loading">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <OrderDetailPanel
        order={selectedOrder}
        loading={detailLoading}
        onBack={() => setSelectedOrder(null)}
        onStatusChange={(s) => updateOrderStatus(selectedOrder.id, s)}
        onRefresh={() => fetchOrderDetail(selectedOrder.id)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-foreground" data-testid="text-orders-title">
              إدارة الطلبات
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">تتبع وإدارة جميع الطلبات</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchOrders} data-testid="button-refresh-orders">
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث
            </Button>
            <CreateOrderDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onCreated={fetchOrders}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <StatsCard
            icon={ShoppingBag}
            label="إجمالي الطلبات"
            value={stats?.total ?? 0}
            iconColor="text-primary"
            iconBg="bg-primary/10"
            testId="text-stat-total"
          />
          <StatsCard
            icon={Plus}
            label="طلبات جديدة"
            value={stats?.new ?? 0}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            testId="text-stat-new"
          />
          <StatsCard
            icon={Clock}
            label="قيد التنفيذ"
            value={stats?.inProgress ?? 0}
            iconColor="text-yellow-500"
            iconBg="bg-yellow-500/10"
            testId="text-stat-progress"
          />
          <StatsCard
            icon={CheckCircle2}
            label="مكتملة"
            value={stats?.completed ?? 0}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            testId="text-stat-completed"
          />
          <StatsCard
            icon={TrendingUp}
            label="الإيرادات"
            value={stats?.totalRevenue ? `${stats.totalRevenue.toLocaleString("ar-SA")} ر.س` : "0"}
            iconColor="text-emerald-500"
            iconBg="bg-emerald-500/10"
            testId="text-stat-revenue"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-max">
          {KANBAN_COLUMNS.map((status) => {
            const statusOrders = getOrdersByStatus(status);
            const config = STATUS_CONFIG[status];
            return (
              <div
                key={status}
                className="w-72 flex flex-col bg-muted/30 dark:bg-muted/10 rounded-lg shrink-0 h-full"
                data-testid={`kanban-column-${status}`}
              >
                <div className="p-3 border-b border-border/50 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{config.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {statusOrders.length}
                    </Badge>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {statusOrders.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">لا توجد طلبات</p>
                  ) : (
                    statusOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onClick={() => fetchOrderDetail(order.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatsCard({
  icon: Icon,
  label,
  value,
  iconColor,
  iconBg,
  testId,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: number | string;
  iconColor: string;
  iconBg: string;
  testId: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-md ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className="text-sm font-bold text-foreground" data-testid={testId}>{value}</p>
        </div>
      </div>
    </Card>
  );
}

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const ServiceIcon = SERVICE_ICONS[order.serviceType as ServiceType] || ShoppingBag;
  const statusConfig = STATUS_CONFIG[order.status as OrderStatus];

  return (
    <Card
      className="p-3 cursor-pointer hover-elevate"
      onClick={onClick}
      data-testid={`card-order-${order.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ServiceIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {SERVICE_LABELS[order.serviceType as ServiceType] || order.serviceType}
          </span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      <p className="text-sm font-medium text-foreground truncate mb-1" data-testid={`text-order-customer-${order.id}`}>
        {(order as any).contact?.name || (order as any).contact?.phone || "عميل"}
      </p>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1" data-testid={`text-order-amount-${order.id}`}>
          <DollarSign className="w-3 h-3" />
          {formatCurrency(order.amount, order.currency)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(order.createdAt)}
        </span>
      </div>

      {(order as any).assignedEmployee && (
        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
          <User className="w-3 h-3" />
          <span className="truncate">{(order as any).assignedEmployee.name}</span>
        </div>
      )}
    </Card>
  );
}

function OrderDetailPanel({
  order,
  loading,
  onBack,
  onStatusChange,
  onRefresh,
}: {
  order: OrderDetail;
  loading: boolean;
  onBack: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onRefresh: () => void;
}) {
  const statusConfig = STATUS_CONFIG[order.status as OrderStatus];
  const ServiceIcon = SERVICE_ICONS[order.serviceType as ServiceType] || ShoppingBag;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-orders">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ServiceIcon className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-lg font-bold text-foreground" data-testid="text-order-detail-title">
                {SERVICE_LABELS[order.serviceType as ServiceType] || order.serviceType}
              </h2>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.id.slice(0, 8)}... | {formatDate(order.createdAt)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} data-testid="button-refresh-detail">
            <RefreshCw className="w-4 h-4 ml-1" />
            تحديث
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">تغيير الحالة</h3>
          <div className="flex flex-wrap gap-2">
            {KANBAN_COLUMNS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={order.status === s ? "default" : "outline"}
                onClick={() => onStatusChange(s)}
                data-testid={`button-status-${s}`}
                className="text-xs"
              >
                {STATUS_CONFIG[s].label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={order.status === "cancelled" ? "destructive" : "outline"}
              onClick={() => onStatusChange("cancelled")}
              data-testid="button-status-cancelled"
              className="text-xs"
            >
              {STATUS_CONFIG.cancelled.label}
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">معلومات الطلب</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">العميل</span>
                <span className="font-medium text-foreground" data-testid="text-detail-customer">
                  {(order as any).contact?.name || (order as any).contact?.phone || "---"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">نوع الخدمة</span>
                <span className="font-medium text-foreground">
                  {SERVICE_LABELS[order.serviceType as ServiceType]}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">المبلغ</span>
                <span className="font-medium text-foreground" data-testid="text-detail-amount">
                  {formatCurrency(order.amount, order.currency)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">حالة الدفع</span>
                <span className="font-medium text-foreground">
                  {order.paymentStatus || "غير مدفوع"}
                </span>
              </div>
              {(order as any).assignedEmployee && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">الموظف المسؤول</span>
                  <span className="font-medium text-foreground">
                    {(order as any).assignedEmployee.name}
                  </span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">ملاحظات</h3>
            <p className="text-sm text-muted-foreground">
              {order.notes || "لا توجد ملاحظات"}
            </p>
          </Card>
        </div>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            عناصر الطلب ({order.items?.length || 0})
          </h3>
          {(!order.items || order.items.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد عناصر</p>
          ) : (
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-2 bg-muted/30 dark:bg-muted/10 rounded-md" data-testid={`row-item-${item.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground">الكمية: {item.quantity}</p>
                  </div>
                  <span className="text-sm font-medium text-foreground shrink-0">
                    {formatCurrency(item.unitPrice, item.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            المدفوعات ({order.payments?.length || 0})
          </h3>
          {(!order.payments || order.payments.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد مدفوعات</p>
          ) : (
            <div className="space-y-2">
              {order.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 p-2 bg-muted/30 dark:bg-muted/10 rounded-md" data-testid={`row-payment-${payment.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(payment.amount, payment.currency)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {payment.method || "تحويل بنكي"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(payment.createdAt)}</p>
                  </div>
                  <Badge
                    variant={payment.status === "confirmed" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {payment.status === "confirmed" ? "مؤكد" : payment.status === "rejected" ? "مرفوض" : "معلق"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CreateOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [serviceType, setServiceType] = useState<string>("other");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await authFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          serviceType,
          notes: notes || undefined,
          amount: amount || undefined,
          status: "new",
        }),
      });
      if (res.ok) {
        toast({ title: "تم إنشاء الطلب بنجاح" });
        onOpenChange(false);
        setServiceType("other");
        setNotes("");
        setAmount("");
        onCreated();
      } else {
        const err = await res.json();
        toast({ title: err.message || "خطأ في إنشاء الطلب", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-order">
          <Plus className="w-4 h-4 ml-1" />
          طلب جديد
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنشاء طلب جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">نوع الخدمة</label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger data-testid="select-service-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">المبلغ (اختياري)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-order-amount"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">ملاحظات (اختياري)</label>
            <Textarea
              placeholder="أضف ملاحظات حول الطلب..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-order-notes"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={creating}
            data-testid="button-submit-order"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
            إنشاء الطلب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
