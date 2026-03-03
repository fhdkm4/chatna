import { storage } from "../storage";
import type { ClassificationResult, ClassificationEntities, Intent } from "./ai-classifier";

export interface WorkflowState {
  intent: Intent;
  collectedFields: ClassificationEntities;
  missingFields: string[];
  stage: "collecting_info" | "ready" | "order_created";
  orderId?: string;
}

interface RequiredFieldDef {
  key: string;
  label: string;
  labelAr: string;
  optional?: boolean;
}

const INTENT_REQUIRED_FIELDS: Record<string, RequiredFieldDef[]> = {
  flight_booking: [
    { key: "destinationCity", label: "Destination", labelAr: "الوجهة" },
    { key: "originCity", label: "Departure city", labelAr: "مدينة المغادرة" },
    { key: "departureDate", label: "Travel date", labelAr: "تاريخ السفر" },
    { key: "passengers", label: "Number of passengers", labelAr: "عدد المسافرين" },
    { key: "returnDate", label: "Return date", labelAr: "تاريخ العودة", optional: true },
    { key: "flightClass", label: "Flight class", labelAr: "درجة الطيران", optional: true },
  ],
  hotel_booking: [
    { key: "destinationCity", label: "City", labelAr: "المدينة" },
    { key: "checkInDate", label: "Check-in date", labelAr: "تاريخ الوصول" },
    { key: "checkOutDate", label: "Check-out date", labelAr: "تاريخ المغادرة" },
    { key: "rooms", label: "Number of rooms", labelAr: "عدد الغرف" },
    { key: "guests", label: "Number of guests", labelAr: "عدد الضيوف", optional: true },
  ],
  visa_request: [
    { key: "destinationCity", label: "Destination country", labelAr: "الدولة المطلوبة" },
    { key: "nationality", label: "Nationality", labelAr: "الجنسية" },
    { key: "passengers", label: "Number of applicants", labelAr: "عدد المتقدمين" },
    { key: "visaType", label: "Visa type", labelAr: "نوع التأشيرة", optional: true },
  ],
  package_booking: [
    { key: "destinationCity", label: "Destination", labelAr: "الوجهة" },
    { key: "departureDate", label: "Travel date", labelAr: "تاريخ السفر" },
    { key: "passengers", label: "Number of travelers", labelAr: "عدد المسافرين" },
    { key: "budget", label: "Budget", labelAr: "الميزانية", optional: true },
  ],
  transport: [
    { key: "originCity", label: "Pickup location", labelAr: "موقع الانطلاق" },
    { key: "destinationCity", label: "Drop-off location", labelAr: "الوجهة" },
    { key: "departureDate", label: "Date", labelAr: "التاريخ" },
    { key: "passengers", label: "Number of passengers", labelAr: "عدد الركاب" },
    { key: "transportType", label: "Vehicle type", labelAr: "نوع المركبة", optional: true },
  ],
  tour: [
    { key: "destinationCity", label: "City/Location", labelAr: "المدينة/الموقع" },
    { key: "departureDate", label: "Date", labelAr: "التاريخ" },
    { key: "passengers", label: "Number of people", labelAr: "عدد الأشخاص" },
  ],
};

const SERVICE_TYPE_MAP: Record<string, string> = {
  flight_booking: "flight",
  hotel_booking: "hotel",
  visa_request: "visa",
  package_booking: "package",
  transport: "transport",
  tour: "tour",
};

function computeMissingFields(intent: Intent, collected: ClassificationEntities): string[] {
  const fields = INTENT_REQUIRED_FIELDS[intent];
  if (!fields) return [];
  return fields
    .filter(f => !f.optional && !collected[f.key])
    .map(f => f.key);
}

function getMissingFieldLabelsAr(intent: Intent, missingKeys: string[]): string[] {
  const fields = INTENT_REQUIRED_FIELDS[intent];
  if (!fields) return missingKeys;
  return missingKeys.map(key => {
    const field = fields.find(f => f.key === key);
    return field ? field.labelAr : key;
  });
}

export function initWorkflow(classification: ClassificationResult): WorkflowState {
  const missingFields = computeMissingFields(classification.intent, classification.entities);
  return {
    intent: classification.intent,
    collectedFields: { ...classification.entities },
    missingFields,
    stage: missingFields.length === 0 ? "ready" : "collecting_info",
  };
}

export function updateWorkflow(state: WorkflowState, newEntities: ClassificationEntities): WorkflowState {
  const merged: ClassificationEntities = { ...state.collectedFields };
  for (const [key, value] of Object.entries(newEntities)) {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  }

  const missingFields = computeMissingFields(state.intent, merged);

  return {
    ...state,
    collectedFields: merged,
    missingFields,
    stage: missingFields.length === 0 ? "ready" : "collecting_info",
  };
}

export function getNextQuestion(state: WorkflowState): string | null {
  if (state.stage !== "collecting_info" || state.missingFields.length === 0) {
    return null;
  }

  const labels = getMissingFieldLabelsAr(state.intent, state.missingFields);

  if (labels.length === 1) {
    return `ممكن تزودني بـ${labels[0]}؟`;
  }
  if (labels.length <= 3) {
    return `أحتاج منك بعض المعلومات: ${labels.join("، ")}`;
  }
  return `ممكن تزودني بـ${labels[0]}؟`;
}

export async function createOrderFromWorkflow(
  state: WorkflowState,
  tenantId: string,
  conversationId: string,
  contactId: string,
): Promise<{ orderId: string; state: WorkflowState }> {
  const serviceType = SERVICE_TYPE_MAP[state.intent] || "other";

  const order = await storage.createOrder({
    tenantId,
    conversationId,
    contactId,
    serviceType,
    status: "collecting_info",
    paymentStatus: "unpaid",
    currency: state.collectedFields.currency || "SAR",
    amount: state.collectedFields.budget?.toString() || null,
    notes: null,
    metadata: {
      intent: state.intent,
      collectedFields: state.collectedFields,
    },
  });

  return {
    orderId: order.id,
    state: {
      ...state,
      stage: "order_created",
      orderId: order.id,
    },
  };
}

export function isBookingIntent(intent: Intent): boolean {
  return intent in INTENT_REQUIRED_FIELDS;
}

export function getWorkflowSummaryAr(state: WorkflowState): string {
  const fields = INTENT_REQUIRED_FIELDS[state.intent];
  if (!fields) return "";

  const lines: string[] = [];
  for (const field of fields) {
    const value = state.collectedFields[field.key];
    if (value !== undefined && value !== null) {
      lines.push(`${field.labelAr}: ${value}`);
    }
  }
  return lines.join("\n");
}
