import React, { useState, type FormEvent } from "react";

/**
 * Distinct user roles available for registration
 */
export type UserRole =
  | "Persons with Disabilities"
  | "Student"
  | "Woman/Carer"
  | "Individual"
  | "Mentor"
  | "Corporate"
  | "Investor"
  | "NGO"
  | "Government"
  | "CodeWithKris Administrator";

export const ADMIN_EMAIL = "roger.s@gradagig.com";

export interface RegistrationFormData {
  fullName: string;
  email: string;
  role: UserRole;
}

export interface RoleOption {
  value: UserRole;
  label: string;
  icon: string;
  description: string;
  restrictedTo?: string;
}

export const BASE_USER_ROLES: RoleOption[] = [
  {
    value: "Persons with Disabilities",
    label: "PWD",
    icon: "♿",
    description: "Personalized speech therapy, accessible coding paths, and inclusive community support.",
  },
  {
    value: "Student",
    label: "Student",
    icon: "🎓",
    description: "Access learning resources, speech practice, and coding challenges.",
  },
  {
    value: "Woman/Carer",
    label: "Woman / Carer",
    icon: "🌸",
    description: "Explore flexible career pathways, mentorship, and support networks.",
  },
  {
    value: "Individual",
    label: "Individual",
    icon: "✨",
    description: "Personal development, communication training, and self-paced growth.",
  },
  {
    value: "Mentor",
    label: "Mentor",
    icon: "🤝",
    description: "Guide learners, review practice sessions, and share professional expertise.",
  },
  {
    value: "Corporate",
    label: "Corporate",
    icon: "🏢",
    description: "Sponsor initiatives, connect with talent, and foster workforce inclusion.",
  },
  {
    value: "Investor",
    label: "Investor",
    icon: "📈",
    description: "Review impact metrics, project milestones, and growth opportunities.",
  },
  {
    value: "NGO",
    label: "NGO",
    icon: "🌍",
    description: "Community empowerment, digital inclusion, and partner programs.",
  },
  {
    value: "Government",
    label: "Government",
    icon: "🏛️",
    description: "Policy initiatives, workforce accessibility, and public sector data.",
  },
];

export const ADMIN_ROLE_OPTION: RoleOption = {
  value: "CodeWithKris Administrator",
  label: "Admin",
  icon: "🛡️",
  description: "Platform administration, user oversight, security controls, and system analytics.",
  restrictedTo: ADMIN_EMAIL,
};

export const USER_ROLES = [...BASE_USER_ROLES, ADMIN_ROLE_OPTION];

/**
 * Returns a customized dashboard greeting based on the user's selected role
 */
export function getRoleGreeting(role: UserRole, name?: string): { headline: string; message: string } {
  const displayName = name?.trim() ? `, ${name.trim()}` : "";

  switch (role) {
    case "Persons with Disabilities":
      return {
        headline: `Welcome to your Accessible Training Hub${displayName}! ♿`,
        message: "Your voice, your pace. Access tailored voice exercises, adaptive pair programming missions, and assistive community tools.",
      };
    case "Student":
      return {
        headline: `Welcome to your Learning Hub${displayName}! 🎓`,
        message: "Ready to practice? Check out today's speech exercises, pair programming missions, and progress streaks.",
      };
    case "Woman/Carer":
      return {
        headline: `Welcome to your Empowerment Space${displayName}! 🌸`,
        message: "We're here to support your journey with flexible learning paths, caregiver-friendly schedules, and community mentors.",
      };
    case "Individual":
      return {
        headline: `Welcome to your Personal Growth Dashboard${displayName}! ✨`,
        message: "Explore tailored speech practice modules, set personal milestones, and track your communication confidence.",
      };
    case "Mentor":
      return {
        headline: `Welcome, Mentor${displayName}! 🤝`,
        message: "Thank you for sharing your expertise. View learner submissions, upcoming 1-on-1 sessions, and feedback requests.",
      };
    case "Corporate":
      return {
        headline: `Welcome to the Corporate Partner Suite${displayName}! 🏢`,
        message: "Manage enterprise sponsorships, engage with qualified talent pipelines, and track social impact goals.",
      };
    case "Investor":
      return {
        headline: `Welcome to the Investor Portal${displayName}! 📈`,
        message: "Explore real-time impact indicators, platform usage analytics, and community outcome reports.",
      };
    case "NGO":
      return {
        headline: `Welcome to the Impact & NGO Network${displayName}! 🌍`,
        message: "Collaborate on community empowerment, track inclusion initiatives, and support speech and digital skills development.",
      };
    case "Government":
      return {
        headline: `Welcome to the Public Sector & Policy Portal${displayName}! 🏛️`,
        message: "Access national accessibility benchmarks, workforce inclusion analytics, and community skill-building programs.",
      };
    case "CodeWithKris Administrator":
      return {
        headline: `Welcome, CodeWithKris Administrator${displayName}! 🛡️`,
        message: "Full administrative access granted. Monitor platform health, oversee user cohorts, review analytics, and audit practice logs.",
      };
    default:
      return {
        headline: `Welcome${displayName}!`,
        message: "Welcome to CodeWithKris.",
      };
  }
}

export interface UserRegistrationProps {
  onRegisterSuccess?: (data: RegistrationFormData) => void;
}

export const UserRegistration: React.FC<UserRegistrationProps> = ({ onRegisterSuccess }) => {
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("Student");
  const [registeredUser, setRegisteredUser] = useState<RegistrationFormData | null>(null);

  const isEligibleForAdmin = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    const eligible = newEmail.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (selectedRole === "CodeWithKris Administrator" && !eligible) {
      setSelectedRole("Student");
    }
  };

  const availableRoles = isEligibleForAdmin
    ? [...BASE_USER_ROLES, ADMIN_ROLE_OPTION]
    : BASE_USER_ROLES;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalRole: UserRole =
      selectedRole === "CodeWithKris Administrator" && !isEligibleForAdmin
        ? "Student"
        : selectedRole;

    const registrationData: RegistrationFormData = {
      fullName,
      email: email.trim(),
      role: finalRole,
    };
    setRegisteredUser(registrationData);
    if (onRegisterSuccess) {
      onRegisterSuccess(registrationData);
    }
  };

  const handleReset = () => {
    setRegisteredUser(null);
    setFullName("");
    setEmail("");
    setSelectedRole("Student");
  };

  if (registeredUser) {
    const greeting = getRoleGreeting(registeredUser.role, registeredUser.fullName);

    return (
      <section className="dashboard-view" aria-labelledby="dashboard-title">
        <div className="dashboard-header">
          <span className="role-badge" data-role={registeredUser.role}>
            {registeredUser.role} Account
          </span>
          <h2 id="dashboard-title">{greeting.headline}</h2>
          <p className="dashboard-subtitle">{greeting.message}</p>
        </div>

        <div className="dashboard-card">
          <h3>Active Profile</h3>
          <p><strong>Name:</strong> {registeredUser.fullName || "Anonymous"}</p>
          <p><strong>Email:</strong> {registeredUser.email}</p>
          <p><strong>Role:</strong> {registeredUser.role}</p>

          <button
            type="button"
            className="secondary-button"
            onClick={handleReset}
            style={{ marginTop: "1rem" }}
          >
            ← Register Another User / Change Role
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="registration-container" aria-labelledby="registration-title">
      <div className="card-heading">
        <span className="section-kicker">Get Started</span>
        <h2 id="registration-title">User Registration</h2>
        <p>Select your primary role to personalize your CodeWithKris experience.</p>
      </div>

      <form onSubmit={handleSubmit} className="registration-form">
        <fieldset className="role-fieldset">
          <legend>
            1. Select Your Role
            {isEligibleForAdmin && (
              <span className="admin-unlocked-badge"> (Admin Role Unlocked)</span>
            )}
          </legend>
          <div className="role-options-grid">
            {availableRoles.map((r) => (
              <label
                key={r.value}
                className={`role-option-card ${selectedRole === r.value ? "selected" : ""} ${
                  r.value === "CodeWithKris Administrator" ? "role-admin-card" : ""
                }`}
              >
                <input
                  type="radio"
                  name="userRole"
                  value={r.value}
                  checked={selectedRole === r.value}
                  onChange={() => setSelectedRole(r.value)}
                  className="role-radio-input"
                />
                <div className="role-option-content">
                  <span className="role-label">
                    <span style={{ marginRight: 6 }}>{r.icon}</span>
                    {r.label}
                    {r.value === "CodeWithKris Administrator" && (
                      <span className="badge-exclusive">Exclusive</span>
                    )}
                  </span>
                  <span className="role-description">{r.description}</span>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="reg-fullname">
          Full Name
          <input
            id="reg-fullname"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Jane Doe"
            required
            autoComplete="name"
          />
        </label>

        <label htmlFor="reg-email">
          Email Address
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="jane@example.com"
            required
            autoComplete="email"
          />
        </label>

        <button type="submit" className="primary-button" style={{ marginTop: "1.25rem" }}>
          Complete Registration ({selectedRole}) <span>→</span>
        </button>
      </form>
    </section>
  );
};

export default UserRegistration;
