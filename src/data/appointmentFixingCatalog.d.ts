export type AppointmentLanguage = "English" | "Cantonese" | "Tamil";
export type AppointmentSubTask = "Greeting" | "AskAvailability" | "CheckSchedule" | "ConfirmAppointment";
export type AppointmentCatalogEntry = {
  sequence: number;
  language: AppointmentLanguage;
  subTask: AppointmentSubTask;
  expectedResult: string;
  receiver: string;
  responseBlock: string;
  voiceQuality: string;
};
export type AppointmentBaseline = {
  languages: string[];
  senderAccuracy: number;
  senderLagMs: number;
  receiverAccuracy: number;
  receiverLagMs: number;
  voiceQuality: string;
};
export const APPOINTMENT_FIXING_STATES: AppointmentSubTask[];
export const APPOINTMENT_FIXING_CATALOG: AppointmentCatalogEntry[];
export const APPOINTMENT_FIXING_BASELINES: {
  Josy: AppointmentBaseline;
  Sri: AppointmentBaseline;
  aggregate: Omit<AppointmentBaseline, "languages" | "voiceQuality">;
};
