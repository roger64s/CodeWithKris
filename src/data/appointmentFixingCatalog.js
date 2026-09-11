export const APPOINTMENT_FIXING_STATES = ["Greeting", "AskAvailability", "CheckSchedule", "ConfirmAppointment"]

export const APPOINTMENT_FIXING_CATALOG = [
  { sequence: 1, language: "English", subTask: "Greeting", expectedResult: "How are you David?", receiver: "I am fine Josy; How are you?", responseBlock: "GreetingResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 2, language: "English", subTask: "AskAvailability", expectedResult: "I am doing great David. Are you available next Tuesday California time 5pm to meet Roger re Haz360 Demo?", receiver: "Sorry Josy Tuesday is not good. How about Wedneday 4pm?", responseBlock: "AskAvailabilityResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 3, language: "English", subTask: "CheckSchedule", expectedResult: "Sure David let me check Roger's calendar; give me a minute", receiver: "Ok thank you", responseBlock: "CheckScheduleResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 4, language: "English", subTask: "ConfirmAppointment", expectedResult: "Ok Confirmed I am sending you a Meeting invite. Thank you David", receiver: "Thank you Josy ; received . Will talk to Roger on Wedensday; See you another time. Bye", responseBlock: "ConfirmAppointmentResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 5, language: "Cantonese", subTask: "Greeting", expectedResult: "David Lei ho ma", receiver: "Lei ho Josy, lei ho ma", responseBlock: "GreetingResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 6, language: "Cantonese", subTask: "AskAvailability", expectedResult: "Ho Ho David. Lei hang a laibai yee tumtakhan tung Roger hoiwui?", receiver: "Mow yi si Josy, ngo hanga laibai yi gho mtakhaan. Wuimwui laibai sam 4tim?", responseBlock: "AskAvailabilityResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 7, language: "Cantonese", subTask: "CheckSchedule", expectedResult: "TohChe David, gho check ha Rogerga Calendar; pei gho yat fun chung", receiver: "Mga Sai", responseBlock: "CheckScheduleResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 8, language: "Cantonese", subTask: "ConfirmAppointment", expectedResult: "Mo man tai David. Gho book cho Rogerga caledar - send email pei lei; To Che sai David", receiver: "Saudola. Thoche sai. Gho tung Roger lai bai sam keen. Ha Chi keen. Bye", responseBlock: "ConfirmAppointmentResponse", voiceQuality: "Partial (not clear)" },
  { sequence: 9, language: "Tamil", subTask: "Greeting", expectedResult: "David sowkiyama?", receiver: "Naan nalam. Neengal eppadi irukkireergal", responseBlock: "GreetingResponse", voiceQuality: "Unintelligible" },
  { sequence: 10, language: "Tamil", subTask: "AskAvailability", expectedResult: "Nanraga irukkiraen David. Neengal varum sevvai rogerudan Haz360 patri Demo parka neral odhukka mudiyuma?", receiver: "Josy sevvai enakku very oru velai ulladhu. Bhudan 4 manikku mudiyuma?", responseBlock: "AskAvailabilityResponse", voiceQuality: "Unintelligible" },
  { sequence: 11, language: "Tamil", subTask: "CheckSchedule", expectedResult: "Nandri David. Enakku oru nimadam kodungal. Rogerin calendarai parthu soliraen", receiver: "Sari", responseBlock: "CheckScheduleResponse", voiceQuality: "Unintelligible" },
  { sequence: 12, language: "Tamil", subTask: "ConfirmAppointment", expectedResult: "Budhan 4manikku Rogerudan confrim pannivitten, ungalukku email anuppivitten; nanri david", receiver: "Enakku kidaithadhu. Nan Rogrudan Bhudan pesgugiren. Vanakkam. Piragu sandipom; Bye", responseBlock: "ConfirmAppointmentResponse", voiceQuality: "Unintelligible" },
]

export const APPOINTMENT_FIXING_BASELINES = {
  Josy: { languages: ["English", "Cantonese"], senderAccuracy: 0.78, senderLagMs: 125, receiverAccuracy: 0.85, receiverLagMs: 90, voiceQuality: "Partial" },
  Sri: { languages: ["Tamil"], senderAccuracy: 0.45, senderLagMs: 250, receiverAccuracy: 0.79, receiverLagMs: 135, voiceQuality: "Not recognizable" },
  aggregate: { senderAccuracy: 0.615, senderLagMs: 187.5, receiverAccuracy: 0.82, receiverLagMs: 112.5 },
}
