import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
);

export type Intent =
  | "flight_booking"
  | "hotel_booking"
  | "visa_request"
  | "package_booking"
  | "transport"
  | "tour"
  | "payment_receipt"
  | "general"
  | "handover";

export interface ClassificationEntities {
  originCity?: string;
  destinationCity?: string;
  departureDate?: string;
  returnDate?: string;
  passengers?: number;
  flightClass?: string;
  hotelName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  rooms?: number;
  guests?: number;
  nationality?: string;
  visaType?: string;
  budget?: number;
  currency?: string;
  packageName?: string;
  transportType?: string;
  tourName?: string;
  [key: string]: string | number | undefined;
}

export interface ClassificationResult {
  intent: Intent;
  entities: ClassificationEntities;
  confidence: number;
}

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  flight_booking: ["طيران", "تذاكر", "تذكرة", "flight", "رحلة", "حجز طيران", "مطار", "سفر بالطيارة", "airplane"],
  hotel_booking: ["فندق", "hotel", "حجز فندق", "إقامة", "غرفة", "room", "accommodation", "نزل"],
  visa_request: ["فيزا", "تأشيرة", "visa", "سفارة", "embassy", "تأشيره"],
  package_booking: ["بكج", "باقة", "package", "باقات", "عروض سياحية", "عرض", "برنامج سياحي"],
  transport: ["نقل", "توصيل", "سيارة", "transport", "transfer", "مواصلات", "ليموزين", "باص"],
  tour: ["جولة", "tour", "رحلة سياحية", "زيارة", "سياحة", "excursion", "أنشطة"],
  payment_receipt: ["إيصال", "تحويل", "دفع", "سداد", "payment", "receipt", "حوالة", "بنك", "تم الدفع", "حولت"],
  general: [],
  handover: ["موظف", "بشر", "حقيقي", "agent", "human", "أبي أكلم شخص", "تحويل لموظف", "مسؤول"],
};

const CITIES = [
  "الرياض", "جدة", "الدمام", "المدينة", "مكة", "أبها", "تبوك", "القصيم", "حائل", "نجران", "جازان",
  "دبي", "أبوظبي", "الشارقة", "الدوحة", "الكويت", "المنامة", "مسقط",
  "القاهرة", "الإسكندرية", "بيروت", "عمان", "بغداد",
  "إسطنبول", "أنطاليا", "طرابزون", "بودروم",
  "لندن", "باريس", "روما", "برشلونة", "أمستردام", "ميونخ", "فيينا", "جنيف", "زيورخ",
  "كوالالمبور", "بانكوك", "جاكرتا", "سنغافورة", "طوكيو", "سيول", "بالي",
  "جورجيا", "تبليسي", "باتومي", "أذربيجان", "باكو",
  "المالديف", "سريلانكا", "موريشيوس", "سيشل", "زنجبار",
  "نيويورك", "لوس أنجلوس", "ميامي", "أورلاندو",
];

export function classifyMessageLocal(message: string): ClassificationResult {
  const lower = message.toLowerCase();
  const entities: ClassificationEntities = {};

  let bestIntent: Intent = "general";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === "general") continue;
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as Intent;
    }
  }

  const detectedCities: string[] = [];
  for (const city of CITIES) {
    if (lower.includes(city.toLowerCase())) {
      detectedCities.push(city);
    }
  }
  if (detectedCities.length >= 1) entities.originCity = detectedCities[0];
  if (detectedCities.length >= 2) entities.destinationCity = detectedCities[1];
  if (detectedCities.length === 1 && bestIntent === "flight_booking") {
    entities.destinationCity = detectedCities[0];
    delete entities.originCity;
  }

  const dateMatch = message.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/g);
  if (dateMatch) {
    entities.departureDate = dateMatch[0];
    if (dateMatch.length >= 2) entities.returnDate = dateMatch[1];
    if (bestIntent === "hotel_booking") {
      entities.checkInDate = dateMatch[0];
      if (dateMatch.length >= 2) entities.checkOutDate = dateMatch[1];
    }
  }

  const passengerMatch = message.match(/(\d+)\s*(شخص|أشخاص|مسافر|مسافرين|person|people|راكب|ركاب)/i);
  if (passengerMatch) {
    entities.passengers = parseInt(passengerMatch[1]);
  }

  const guestMatch = message.match(/(\d+)\s*(ضيف|ضيوف|نزيل|guest|guests)/i);
  if (guestMatch) {
    entities.guests = parseInt(guestMatch[1]);
  }

  const roomMatch = message.match(/(\d+)\s*(غرفة|غرف|room|rooms)/i);
  if (roomMatch) {
    entities.rooms = parseInt(roomMatch[1]);
  }

  const budgetMatch = message.match(/(\d[\d,]*)\s*(ريال|SAR|دولار|USD|\$|جنيه|EGP|درهم|AED)/i);
  if (budgetMatch) {
    entities.budget = parseFloat(budgetMatch[1].replace(/,/g, ""));
    const currencyMap: Record<string, string> = {
      "ريال": "SAR", "sar": "SAR", "دولار": "USD", "usd": "USD", "$": "USD",
      "جنيه": "EGP", "egp": "EGP", "درهم": "AED", "aed": "AED",
    };
    entities.currency = currencyMap[budgetMatch[2].toLowerCase()] || "SAR";
  }

  if (lower.includes("اقتصاد") || lower.includes("economy")) entities.flightClass = "economy";
  if (lower.includes("رجال أعمال") || lower.includes("business")) entities.flightClass = "business";
  if (lower.includes("أولى") || lower.includes("first class")) entities.flightClass = "first";

  const confidence = bestScore === 0 ? 0.3 : Math.min(0.5 + bestScore * 0.15, 0.85);

  return { intent: bestIntent, entities, confidence };
}

export async function classifyMessage(message: string, hasImage?: boolean): Promise<ClassificationResult> {
  if (hasImage) {
    const localResult = classifyMessageLocal(message);
    if (localResult.intent === "general" || message.trim().length === 0) {
      return { intent: "payment_receipt", entities: localResult.entities, confidence: 0.7 };
    }
    return localResult;
  }

  const localResult = classifyMessageLocal(message);

  if (localResult.confidence >= 0.65) {
    return localResult;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are an intent classifier for a travel agency customer service system.
Classify the user message into ONE of these intents:
- flight_booking: Customer wants to book a flight
- hotel_booking: Customer wants to book a hotel
- visa_request: Customer needs visa assistance
- package_booking: Customer wants a travel package/bundle
- transport: Customer needs transportation/transfer service
- tour: Customer wants tour/excursion booking
- payment_receipt: Customer is sending payment confirmation
- general: General inquiry or greeting
- handover: Customer wants to speak to a human agent

Extract entities where possible: cities, dates, number of passengers, budget.

User message: ${message}

Respond ONLY with valid JSON:
{"intent":"<intent>","entities":{},"confidence":0.0}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const mergedEntities = { ...localResult.entities, ...parsed.entities };
      return {
        intent: parsed.intent as Intent,
        entities: mergedEntities,
        confidence: parsed.confidence || 0.8,
      };
    }
  } catch (error) {
    console.error("AI classifier error, falling back to local:", error);
  }

  return localResult;
}
