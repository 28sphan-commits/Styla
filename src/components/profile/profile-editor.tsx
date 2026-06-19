"use client";

import { useRef, useState } from "react";
import { Camera, Check, Crown, Save, Sparkles } from "lucide-react";
import {
  bodyTypeOptions,
  budgetOptions,
  colorPreferenceOptions,
  lifestyleOptions,
  styleAestheticOptions,
  type StyleDna
} from "@/lib/onboarding";
import type { ProfileRecord } from "@/lib/profile/schema";

type ProfileEditorProps = {
  initialProfile: ProfileRecord;
  initialStyleDna: StyleDna;
};

const planCards = [
  {
    tier: "free",
    name: "Free",
    price: "$0 / month",
    detail: "Basic access with limited generations and chat."
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$9.99 / month",
    detail: "15 daily generations, advanced AI insights, unlimited chat."
  },
  {
    tier: "elite",
    name: "Elite",
    price: "$24.99 / month",
    detail: "Unlimited everything, personal AI stylist, curated collections."
  }
] as const;

const paymentLinks = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK,
  elite: process.env.NEXT_PUBLIC_STRIPE_ELITE_PAYMENT_LINK
} as const;

export function ProfileEditor({
  initialProfile,
  initialStyleDna
}: ProfileEditorProps) {
  const avatarRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(initialProfile);
  const [styleDna, setStyleDna] = useState(initialStyleDna);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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
    Object.entries(styleDna).forEach(([key, value]) => {
      formData.append(key, value);
    });

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
        </div>
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
