"use client";

import { useRef, useState } from "react";
import { Camera, Check, Crown, MessageSquare, Save, Send, Sparkles } from "lucide-react";
import {
  bodyTypeOptions,
  budgetOptions,
  colorPreferenceOptions,
  lifestyleOptions,
  styleAestheticOptions,
  type StyleDna
} from "@/lib/onboarding";
import { MeasurementFields } from "@/components/fit/measurement-fields";
import {
  buildMeasureState,
  canonicalFrom,
  type InitialMeasurements,
  type MeasureState
} from "@/lib/fit/measurements";
import type { ProfileRecord } from "@/lib/profile/schema";

type ProfileEditorProps = {
  initialProfile: ProfileRecord;
  initialStyleDna: StyleDna;
  initialGender?: string;
  initialStyleNotes?: string;
  initialMeasurements?: InitialMeasurements;
};

const planCards = [
  {
    tier: "free",
    name: "Free",
    price: "$0 / month",
    detail: "Get started with generous limits so you can explore.",
    features: [
      "Up to 40 item uploads (earn up to 78)",
      "Automatic AI categorization",
      "25 outfit generations",
      "60 messages with the Styla AI chat",
      "30 style goal checks"
    ]
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$6.99 / month",
    detail: "Scan your whole wardrobe and go deeper.",
    features: [
      "250 item uploads",
      "Advanced wardrobe scan — snap your closet, auto-categorized",
      "100 outfit generations with seasonal styling",
      "200 messages with the Styla AI chat",
      "100 style goal checks"
    ]
  },
  {
    tier: "elite",
    name: "Elite",
    price: "$14.99 / month",
    detail: "Everything unlimited, plus early access.",
    features: [
      "Unlimited uploads & outfit generations",
      "Unlimited Styla AI chat",
      "Personalized trend recommendations & how you align",
      "40 virtual try-ons (beta)",
      "Early access to new features"
    ]
  }
] as const;

const paymentLinks = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK,
  elite: process.env.NEXT_PUBLIC_STRIPE_ELITE_PAYMENT_LINK
} as const;

export function ProfileEditor({
  initialProfile,
  initialStyleDna,
  initialGender = "",
  initialStyleNotes = "",
  initialMeasurements
}: ProfileEditorProps) {
  const avatarRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(initialProfile);
  const [styleDna, setStyleDna] = useState(initialStyleDna);
  const [gender, setGender] = useState(initialGender);
  const [styleNotes, setStyleNotes] = useState(initialStyleNotes);
  const [measure, setMeasure] = useState<MeasureState>(() =>
    buildMeasureState(initialMeasurements)
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  function chooseAvatar(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function saveProfile() {
    setIsSaving(true);
    setError(null);
    setStatus(null);

    const formData = new FormData();
    formData.append("username", profile.username ?? "");
    formData.append("bio", profile.bio ?? "");
    formData.append("membership_tier", profile.membership_tier);
    formData.append("is_public", String(profile.is_public));
    formData.append("show_outfits", String(profile.show_outfits));
    // Append only the known Style DNA fields explicitly. `styleDna` is loaded
    // via select("*") so it also carries gender/style_notes/timestamps; blindly
    // appending those would shadow the edited gender/style_notes values below.
    formData.append("style_aesthetic", styleDna.style_aesthetic);
    formData.append("body_type", styleDna.body_type);
    formData.append("lifestyle", styleDna.lifestyle);
    formData.append("budget_per_item", styleDna.budget_per_item);
    formData.append("color_preference", styleDna.color_preference);
    formData.append("gender", gender);
    formData.append("style_notes", styleNotes);

    const canonical = canonicalFrom(measure);
    formData.append(
      "height_cm",
      canonical.heightCm != null ? canonical.heightCm.toFixed(1) : ""
    );
    formData.append(
      "weight_kg",
      canonical.weightKg != null ? canonical.weightKg.toFixed(1) : ""
    );
    formData.append("measurement_unit", measure.unit);

    if (avatarFile) {
      formData.append("avatar", avatarFile);
    }

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save profile.");
      }

      setProfile(payload.profile);
      setStyleDna(payload.styleDna);
      setGender(payload.styleDna.gender ?? "");
      setStyleNotes(payload.styleDna.style_notes ?? "");
      if (payload.measurements) {
        setMeasure(
          buildMeasureState({
            heightCm:
              payload.measurements.height_cm != null
                ? Number(payload.measurements.height_cm)
                : null,
            weightKg:
              payload.measurements.weight_kg != null
                ? Number(payload.measurements.weight_kg)
                : null,
            unit:
              payload.measurements.measurement_unit === "metric"
                ? "metric"
                : "imperial"
          })
        );
      }
      setAvatarFile(null);
      setStatus("Profile saved.");
      window.setTimeout(() => setStatus(null), 1800);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function sendFeedback() {
    setFeedbackSending(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedbackMessage })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send feedback.");
      setFeedbackMessage("");
      setFeedbackSent(true);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Could not send feedback.");
    } finally {
      setFeedbackSending(false);
    }
  }

  return (
    <section className="profile-page page-shell">
      <div className="profile-identity">
        <button
          className="avatar-button"
          type="button"
          onClick={() => avatarRef.current?.click()}
        >
          {avatarPreview || profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview ?? profile.avatar_url ?? ""} alt="" referrerPolicy="no-referrer" />
          ) : (
            <Camera size={22} aria-hidden="true" />
          )}
        </button>
        <input
          ref={avatarRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => chooseAvatar(event.target.files?.[0] ?? null)}
        />

        <div>
          <div className="section-kicker">The Profile</div>
          <h1>{profile.full_name ?? "Your Profile"}</h1>
          <p>{profile.email ?? "No email on file"}</p>
          <small>Only you see your name. Others see your username.</small>
        </div>
      </div>

      <div className="rule" />

      <section className="profile-panel">
        <div className="panel-heading">
          <div>
            <span>Style DNA</span>
            <h2>Your Style Profile</h2>
          </div>
          <button className="small-dark-button" type="button" onClick={() => void saveProfile()}>
            <Save size={13} aria-hidden="true" />
            {isSaving ? "Saving" : "Save"}
          </button>
        </div>

        <div className="style-dna-grid">
          <SelectField
            label="Style Aesthetic"
            value={styleDna.style_aesthetic}
            options={styleAestheticOptions}
            onChange={(value) =>
              setStyleDna((current) => ({ ...current, style_aesthetic: value }))
            }
          />
          <SelectField
            label="Body Type"
            value={styleDna.body_type}
            options={bodyTypeOptions}
            onChange={(value) =>
              setStyleDna((current) => ({ ...current, body_type: value }))
            }
          />
          <SelectField
            label="Lifestyle"
            value={styleDna.lifestyle}
            options={lifestyleOptions}
            onChange={(value) =>
              setStyleDna((current) => ({ ...current, lifestyle: value }))
            }
          />
          <SelectField
            label="Budget Per Item"
            value={styleDna.budget_per_item}
            options={budgetOptions}
            onChange={(value) =>
              setStyleDna((current) => ({ ...current, budget_per_item: value }))
            }
          />
          <SelectField
            label="Color Preference"
            value={styleDna.color_preference}
            options={colorPreferenceOptions}
            onChange={(value) =>
              setStyleDna((current) => ({ ...current, color_preference: value }))
            }
          />
          <label className="profile-select">
            <span>Gender</span>
            <input
              value={gender}
              maxLength={80}
              placeholder="How you identify"
              onChange={(event) => setGender(event.target.value)}
            />
            <small>Helps tailor fits and silhouettes.</small>
          </label>
        </div>

        <div className="profile-build">
          <span className="profile-subhead">Your Build</span>
          <MeasurementFields
            value={measure}
            onChange={setMeasure}
            showPreview={false}
            hint="Sizes your fitting-room silhouette. Optional."
          />
        </div>

        <label className="profile-style-notes">
          <span>Style Notes</span>
          <textarea
            value={styleNotes}
            maxLength={1200}
            placeholder="Describe your style in your own words…"
            onChange={(event) => setStyleNotes(event.target.value)}
          />
          <small>{styleNotes.length}/1200</small>
        </label>
      </section>

      <section className="profile-panel">
        <div className="panel-heading">
          <div>
            <span>Membership</span>
            <h2>Your Plan</h2>
          </div>
        </div>

        <div className="plan-grid">
          {planCards.map((plan) => (
            <article
              key={plan.tier}
              className={
                profile.membership_tier === plan.tier ? "plan-card is-active" : "plan-card"
              }
            >
              {plan.tier === "elite" ? (
                <Crown size={16} aria-hidden="true" />
              ) : (
                <Sparkles size={16} aria-hidden="true" />
              )}
              <strong>{plan.name}</strong>
              <span>{plan.price}</span>
              <p>{plan.detail}</p>
              <ul className="plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {profile.membership_tier === plan.tier ? <Check size={15} /> : null}
              <div className="plan-actions">
                <button
                  type="button"
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      membership_tier: plan.tier
                    }))
                  }
                >
                  Select
                </button>
                {plan.tier !== "free" && paymentLinks[plan.tier] ? (
                  <a href={paymentLinks[plan.tier]} target="_blank" rel="noreferrer">
                    Pay
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="profile-panel">
        <div className="panel-heading">
          <div>
            <span>Social Settings</span>
            <h2>How You Appear</h2>
          </div>
        </div>

        <div className="social-settings-grid">
          <label>
            <span>Username</span>
            <input
              value={profile.username ?? ""}
              placeholder="your_username"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  username: event.target.value
                }))
              }
            />
            <small>3-20 characters. Letters, numbers, underscores.</small>
          </label>

          <label>
            <span>Bio</span>
            <textarea
              value={profile.bio ?? ""}
              maxLength={160}
              placeholder="Tell people about your style..."
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  bio: event.target.value
                }))
              }
            />
            <small>{profile.bio?.length ?? 0}/160</small>
          </label>

          <ToggleRow
            label="Make profile public"
            detail="Appear in Explore and get a shareable profile link."
            checked={profile.is_public}
            onChange={(checked) =>
              setProfile((current) => ({ ...current, is_public: checked }))
            }
          />
          <ToggleRow
            label="Show my outfits"
            detail="Your generated outfits appear on your profile and in the feed."
            checked={profile.show_outfits}
            onChange={(checked) =>
              setProfile((current) => ({ ...current, show_outfits: checked }))
            }
          />
        </div>
      </section>

      <section className="profile-panel">
        <div className="panel-heading">
          <div>
            <span>Feedback</span>
            <h2>Tell Us What You Think</h2>
          </div>
        </div>
        <p className="feedback-intro">
          Got a feature request, spotted a bug, or just want to share how Styla
          is working for you? We read every message.
        </p>
        {feedbackSent ? (
          <div className="feedback-sent">
            <Check size={15} aria-hidden="true" />
            <span>Thanks for the feedback — we appreciate it!</span>
          </div>
        ) : (
          <div className="feedback-form">
            <label className="profile-style-notes">
              <span>Your message</span>
              <textarea
                value={feedbackMessage}
                maxLength={2000}
                placeholder="What's on your mind?"
                onChange={(event) => setFeedbackMessage(event.target.value)}
              />
              <small>{feedbackMessage.length}/2000</small>
            </label>
            {feedbackError ? <p className="inline-error">{feedbackError}</p> : null}
            <button
              className="small-dark-button"
              type="button"
              disabled={feedbackSending || feedbackMessage.trim().length === 0}
              onClick={() => void sendFeedback()}
            >
              <Send size={13} aria-hidden="true" />
              {feedbackSending ? "Sending…" : "Send Feedback"}
            </button>
            <small className="feedback-quest-hint">
              <MessageSquare size={11} aria-hidden="true" />
              Sending feedback completes the &ldquo;Tell us what you think&rdquo; quest.
            </small>
          </div>
        )}
      </section>

      {error ? <p className="inline-error">{error}</p> : null}
      {status ? <p className="inline-success">{status}</p> : null}

      <button className="profile-save-bar" type="button" onClick={() => void saveProfile()}>
        <Save size={14} aria-hidden="true" />
        {isSaving ? "Saving Settings" : "Save Settings"}
      </button>
    </section>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; detail: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="profile-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <small>{options.find((option) => option.value === value)?.detail}</small>
    </label>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onChange
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
