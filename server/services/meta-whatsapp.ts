const GRAPH_API_VERSION = "v17.0";

export async function sendMetaWhatsAppMessage(
  recipientPhone: string,
  text: string,
): Promise<string | null> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("Meta WhatsApp credentials not configured (WHATSAPP_TOKEN or PHONE_NUMBER_ID missing)");
    return null;
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "text",
        text: { body: text },
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Meta WhatsApp API error:", data.error?.message || data);
      return null;
    }

    const messageId = data.messages?.[0]?.id || null;
    console.log(`Meta WhatsApp message sent to ${recipientPhone}, id: ${messageId}`);
    return messageId;
  } catch (error) {
    console.error("Meta WhatsApp send error:", error);
    return null;
  }
}

export async function sendMetaWhatsAppInteractiveButtons(
  recipientPhone: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
): Promise<string | null> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("Meta WhatsApp credentials not configured");
    return null;
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons.map((btn) => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Meta WhatsApp Interactive API error:", data.error?.message || data);
      return null;
    }

    const messageId = data.messages?.[0]?.id || null;
    console.log(`Meta WhatsApp interactive message sent to ${recipientPhone}, id: ${messageId}`);
    return messageId;
  } catch (error) {
    console.error("Meta WhatsApp interactive send error:", error);
    return null;
  }
}

export async function getMetaMediaUrl(mediaId: string): Promise<string | null> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  if (!WHATSAPP_TOKEN) return null;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
      {
        headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
      },
    );
    const data = await response.json() as any;
    return data.url || null;
  } catch (error) {
    console.error("Get Meta media URL error:", error);
    return null;
  }
}

export async function downloadMetaMedia(url: string): Promise<{ base64: string; mimeType: string } | null> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  if (!WHATSAPP_TOKEN) return null;

  try {
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      base64: buffer.toString("base64"),
      mimeType: contentType,
    };
  } catch (error) {
    console.error("Download Meta media error:", error);
    return null;
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;

  try {
    await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      },
    );
  } catch (error) {
    console.error("Mark as read error:", error);
  }
}
