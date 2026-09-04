import { useEffect, useState } from "react";
import { Check, Flame, Lock, Play, RefreshCw, Trophy, Zap } from "lucide-react";
import { supabase } from "../supabase";
import { VocabularyPractice } from "./VocabularyPractice";
import { ReframingCueSwitcher } from "./ReframingCueSwitcher";
import "./LearningWorkspace.css";

type LearningProfile = {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
};
type LearningNode = {
  key: string;
  title: string;
  description: string;
  track: "universal_foundation" | "commercial_task_tracks" | "applied_ai_workflow";
  position: number;
  xp_reward: number;
  prerequisite_keys: string[];
};
type NodeCompletion = { node_key: string; completion_count: number; last_completed_at: string };
type LearningDashboard = { profile: LearningProfile; nodes: LearningNode[]; completions: NodeCompletion[] };

async function learningApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/v1/learning${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const responseText = await response.text();
  let payload: T | { error?: string };
  try { payload = JSON.parse(responseText) as T | { error?: string }; }
  catch { throw new Error(`Learning service returned HTTP ${response.status}. ${responseText.slice(0, 160)}`); }
  if (!response.ok) throw new Error((payload as { error?: string }).error || `Learning service returned HTTP ${response.status}.`);
  return payload as T;
}

const activeStreak = (profile: LearningProfile) => {
  if (!profile.last_activity_date) return 0;
  const activity = new Date(`${profile.last_activity_date}T00:00:00Z`);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return todayUtc - activity.getTime() <= 86400000 ? profile.current_streak : 0;
};

export function StreakCounterWidget({ profile }: { profile: LearningProfile }) {
  const streak = activeStreak(profile);
  return <section className="learning-streak" aria-label="Daily coding streak">
    <div className="streak-flame"><Flame size={28} fill="currentColor" /></div>
    <div><span>Daily coding streak</span><strong>{streak} {streak === 1 ? "day" : "days"}</strong><small>Longest streak: {profile.longest_streak} days</small></div>
    <div className="streak-week" aria-label="Seven-day consistency target">
      {Array.from({ length: 7 }, (_, index) => <i className={index < Math.min(streak, 7) ? "active" : ""} key={index}>{index + 1}</i>)}
    </div>
  </section>;
}

export function SkillTreeMilestoneMap({ nodes, completions, onStartMission }: {
  nodes: LearningNode[];
  completions: NodeCompletion[];
  onStartMission: (missionTitle: string) => void;
}) {
  const completedKeys = new Set(completions.map((item) => item.node_key));
  const tracks = [
    { key: "universal_foundation", label: "Universal Foundation", detail: "3 communication foundations" },
    { key: "commercial_task_tracks", label: "Commercial Task Tracks", detail: "4 flexible real-world tracks" },
    { key: "applied_ai_workflow", label: "Applied AI & Workflow Execution", detail: "4 applied workflow missions" },
  ] as const;
  return <div className="skill-tree">
    {tracks.map((track) => <section className="skill-track" key={track.key}>
      <header><span>{track.label}</span><small>{track.detail}</small></header>
      <div className="skill-path">
        {nodes.filter((node) => node.track === track.key).sort((left, right) => left.position - right.position).map((node, index) => {
          const completed = completedKeys.has(node.key);
          const unlocked = node.prerequisite_keys.every((key) => completedKeys.has(key));
          return <div className={`skill-node ${completed ? "completed" : unlocked ? "unlocked" : "locked"}`} key={node.key}>
            {index > 0 && <span className="skill-connector" />}
            <button type="button" disabled={!unlocked} onClick={() => onStartMission(node.title)} aria-label={`${completed ? "Practice again" : "Start"} ${node.title}`}>
              {completed ? <Check size={24} /> : unlocked ? <Play size={22} fill="currentColor" /> : <Lock size={20} />}
            </button>
            <div><strong>{node.title}</strong><p>{node.description}</p><small><Zap size={13} fill="currentColor" /> {node.xp_reward} XP {completed && `· Completed ${completions.find((item) => item.node_key === node.key)?.completion_count}x`}</small></div>
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}

export function LearningWorkspace({ onStartMission }: { onStartMission: (missionTitle: string) => void }) {
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    try { setDashboard(await learningApi<LearningDashboard>("/dashboard")); setError(""); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Learning progress could not be loaded."); }
  };

  useEffect(() => { void learningApi<LearningDashboard>("/dashboard").then(setDashboard).catch((loadError) => setError(loadError.message)); }, []);

  if (error && !dashboard) return <section className="learning-workspace learning-error"><Trophy size={34} /><h1>Learning progress is unavailable</h1><p>{error}</p><button onClick={() => void loadDashboard()}><RefreshCw size={16} /> Try again</button></section>;
  if (!dashboard) return <div className="learning-loading">Loading your learning path...</div>;

  const level = Math.floor(dashboard.profile.total_xp / 100) + 1;
  const levelProgress = dashboard.profile.total_xp % 100;
  const completedCount = dashboard.completions.length;
  return <section className="learning-workspace">
    <header className="learning-heading"><div><span>CodeWithKris learning path</span><h1>Build the habit. Level up the skill.</h1><p>Small technical challenges create visible progress without turning learning into a race.</p></div><div className="level-mark"><small>Level</small><strong>{level}</strong></div></header>
    {error && <div className="learning-error-line" role="alert">{error}</div>}
    <div className="learning-summary">
      <StreakCounterWidget profile={dashboard.profile} />
      <section className="xp-widget"><div><span>Total experience</span><strong><Zap size={21} fill="currentColor" /> {dashboard.profile.total_xp} XP</strong><small>{100 - levelProgress} XP to Level {level + 1}</small></div><div className="xp-track"><i style={{ width: `${levelProgress}%` }} /></div></section>
      <section className="milestone-widget"><Trophy size={25} /><div><span>Milestones</span><strong>{completedCount} of {dashboard.nodes.length}</strong><small>{dashboard.nodes.length - completedCount} remaining</small></div></section>
    </div>
    <VocabularyPractice onXpAwarded={() => void loadDashboard()} />
    <ReframingCueSwitcher onXpAwarded={() => void loadDashboard()} />
    <div className="learning-tree-heading"><div><span>Three-pathway progression</span><h2>Your CodeWithKris pathways</h2></div><p>Each pathway mission matches the existing dashboard. Complete any mission at your own pace and revisit it to reinforce the habit.</p></div>
    <SkillTreeMilestoneMap nodes={dashboard.nodes} completions={dashboard.completions} onStartMission={onStartMission} />
  </section>;
}