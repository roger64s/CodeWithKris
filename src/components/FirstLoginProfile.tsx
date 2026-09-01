import { useState, type FormEvent } from "react";
import { supabase } from "../supabase";

type FirstLoginProfileProps = {
  userId: string;
  signupAt: string;
  onComplete: () => void;
  onInactive: () => Promise<void>;
};

const ENGLISH_LEVELS = ["No skill", "Beginner", "Intermediate", "Fluent"] as const;

export function FirstLoginProfile({ userId, signupAt, onComplete, onInactive }: FirstLoginProfileProps) {
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [education, setEducation] = useState("");
  const [disabilityCategory, setDisabilityCategory] = useState("None");
  const [speechLevel, setSpeechLevel] = useState("Not applicable");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [motherTongue, setMotherTongue] = useState("");
  const [englishReading, setEnglishReading] = useState("No skill");
  const [englishWriting, setEnglishWriting] = useState("No skill");
  const [englishListening, setEnglishListening] = useState("No skill");
  const [englishSpeaking, setEnglishSpeaking] = useState("No skill");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [signLanguageSkills, setSignLanguageSkills] = useState("");
  const [identityStatement, setIdentityStatement] = useState("");
  const [skills, setSkills] = useState(["", "", ""]);
  const [aspiration, setAspiration] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [funFact, setFunFact] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || skills.some((skill) => !skill.trim())) return;
    setSaving(true);
    setStatus("");
    const now = new Date().toISOString();
    const { error } = await supabase.from("user_profiles").upsert({
      user_id: userId,
      signup_at: signupAt,
      age: Number(age),
      gender: gender.trim(),
      education: education.trim(),
      disability_category: disabilityCategory,
      speech_impairment_level: speechLevel,
      city: city.trim(),
      country: country.trim(),
      mother_tongue: motherTongue.trim(),
      english_reading: englishReading,
      english_writing: englishWriting,
      english_listening: englishListening,
      english_speaking: englishSpeaking,
      preferred_language: preferredLanguage.trim(),
      sign_language_skills: signLanguageSkills.trim(),
      identity_statement: identityStatement.trim(),
      top_skills: skills.map((skill) => skill.trim()),
      aspiration: aspiration.trim(),
      hobbies: hobbies.trim(),
      fun_fact: funFact.trim(),
      research_consent: consent,
      completed_at: now,
      updated_at: now,
    });
    setSaving(false);
    if (error) return setStatus(`Profile was not saved: ${error.message}`);
    onComplete();
  };

  const markInactive = async () => {
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.from("user_profiles").upsert({
      user_id: userId,
      signup_at: signupAt,
      inactive_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) {
      setSaving(false);
      setStatus(`Account status was not updated: ${error.message}`);
      return;
    }
    await onInactive();
  };

  const englishField = (label: string, value: string, setValue: (value: string) => void) => (
    <label className="text-sm font-bold text-slate-800">{label}<select className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)}>{ENGLISH_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
  );

  return <main className="min-h-screen bg-[#f8f7fc] px-4 py-8 text-slate-950 sm:px-7">
    <form className="mx-auto max-w-5xl" onSubmit={saveProfile}>
      <header className="border-b border-slate-200 pb-5"><span className="text-xs font-bold uppercase text-emerald-700">First login profile</span><h1 className="mt-2 text-3xl font-bold">Tell us about yourself</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This information is used only for research, Gradagig training and earning opportunities, and improving the quality of our solution.</p><div className="mt-3 text-xs font-bold text-slate-500">Signup date: {new Date(signupAt).toLocaleDateString()}</div></header>

      <section className="grid gap-4 border-b border-slate-200 py-6 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="background-title">
        <h2 id="background-title" className="text-xl font-bold sm:col-span-2 lg:col-span-3">Background</h2>
        <Field label="Age" type="number" value={age} setValue={setAge} min="13" max="120" />
        <Field label="Gender" value={gender} setValue={setGender} />
        <Field label="Education" value={education} setValue={setEducation} />
        <SelectField label="Category of disability" value={disabilityCategory} setValue={setDisabilityCategory} options={["None", "Speech", "Hearing", "Visual", "Physical", "Other", "Prefer not to say"]} />
        <SelectField label="Speech impairment level" value={speechLevel} setValue={setSpeechLevel} options={["Not applicable", "Unintelligible", "Partial", "Very clear", "Prefer not to say"]} />
        <Field label="City" value={city} setValue={setCity} />
        <Field label="Country" value={country} setValue={setCountry} />
        <Field label="Mother tongue" value={motherTongue} setValue={setMotherTongue} placeholder="Cantonese, Mandarin, Tamil, Hindi, Telugu..." />
        <Field label="Preferred language" value={preferredLanguage} setValue={setPreferredLanguage} />
        <Field label="Sign language skills" value={signLanguageSkills} setValue={setSignLanguageSkills} placeholder="None, beginner, intermediate, fluent..." />
      </section>

      <section className="grid gap-4 border-b border-slate-200 py-6 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="english-title">
        <h2 id="english-title" className="text-xl font-bold sm:col-span-2 lg:col-span-4">English level</h2>
        {englishField("Read", englishReading, setEnglishReading)}
        {englishField("Write", englishWriting, setEnglishWriting)}
        {englishField("Listen", englishListening, setEnglishListening)}
        {englishField("Speak", englishSpeaking, setEnglishSpeaking)}
      </section>

      <section className="grid gap-4 py-6 sm:grid-cols-2" aria-labelledby="about-title">
        <h2 id="about-title" className="text-xl font-bold sm:col-span-2">About you</h2>
        <TextArea label="Who you are" value={identityStatement} setValue={setIdentityStatement} />
        <TextArea label="Your aspiration" value={aspiration} setValue={setAspiration} />
        {skills.map((skill, index) => <Field key={index} label={`Top skill ${index + 1}`} value={skill} setValue={(value) => setSkills((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} />)}
        <Field label="Hobbies" value={hobbies} setValue={setHobbies} />
        <Field label="Fun fact" value={funFact} setValue={setFunFact} />
      </section>

      <label className="flex items-start gap-3 border-y border-slate-200 py-4 text-sm leading-6 text-slate-700"><input className="mt-1 h-4 w-4" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>I understand that this information will be used only for research, Gradagig training and earning opportunities, and improving the quality of the solution.</span></label>
      {status && <p className="mt-4 text-sm font-bold text-red-700" role="alert">{status}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button className="text-sm font-bold text-slate-600 underline" type="button" disabled={saving} onClick={markInactive}>I prefer not to continue</button><button className="min-h-11 rounded-md bg-emerald-700 px-6 text-sm font-bold text-white disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Saving..." : "Complete profile"}</button></div>
    </form>
  </main>;
}

function Field({ label, value, setValue, type = "text", placeholder, min, max }: { label: string; value: string; setValue: (value: string) => void; type?: string; placeholder?: string; min?: string; max?: string }) {
  return <label className="text-sm font-bold text-slate-800">{label}<input className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal" type={type} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} min={min} max={max} required /></label>;
}

function SelectField({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[] }) {
  return <label className="text-sm font-bold text-slate-800">{label}<select className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function TextArea({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <label className="text-sm font-bold text-slate-800">{label}<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white p-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)} required /></label>;
}