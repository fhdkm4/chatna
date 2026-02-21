import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

let client: twilio.Twilio | null = null;

function getClient(): twilio.Twilio | null {
  if (!accountSid || !authToken) {
    console.warn("Twilio credentials not configured. WhatsApp messaging is disabled.");
    return null;
  }
  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendWhatsAppMessage(to: string, body: string, mediaUrl?: string): Promise<string | null> {
  const twilioClient = getClient();
  if (!twilioClient) {
    console.log(`[Twilio Disabled] Would send to ${to}: ${body}${mediaUrl ? ` [media: ${mediaUrl}]` : ""}`);
    return null;
  }

  try {
    const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const messageOptions: any = {
      from: twilioWhatsappNumber,
      to: toNumber,
      body,
    };
    if (mediaUrl) {
      messageOptions.mediaUrl = [mediaUrl];
    }
    const message = await twilioClient.messages.create(messageOptions);
    return message.sid;
  } catch (error) {
    console.error("Twilio send error:", error);
    throw error;
  }
}

export function parseIncomingMessage(body: any) {
  return {
    from: body.From || "",
    content: body.Body || "",
    messageSid: body.MessageSid || "",
    profileName: body.ProfileName || "",
    mediaUrl: body.MediaUrl0 || null,
    mediaType: body.MediaContentType0 || null,
    metaMediaId: body.MediaSid0 || null,
    numMedia: parseInt(body.NumMedia || "0", 10),
  };
}
