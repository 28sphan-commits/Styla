// The guided photo-capture rundown (Doji-style). One step per shot, each tagged
// with a stable `label` stored on fit_selfies.label. Shared by the capture wizard
// (client) and the selfies/generate routes (server), so the sequence and the
// validation/selection logic never drift apart.

export type CaptureGuide = "body" | "face";
export type CaptureFacing =
  | "front"
  | "left"
  | "right"
  | "up_left"
  | "up_right"
  | "down_left"
  | "down_right";

export type CaptureStep = {
  label: string;
  title: string;
  instruction: string;
  tips: string[];
  guide: CaptureGuide;
  facing?: CaptureFacing;
  required: boolean;
  // Which camera the device should default to (front for face, rear for body).
  camera: "user" | "environment";
};

// The canvas (try-on body) and the face source used for sharpening.
export const CANVAS_LABEL = "full_body";
export const FACE_LABEL = "front";

export const CAPTURE_STEPS: CaptureStep[] = [
  {
    label: "full_body",
    title: "Full body",
    instruction: "Stand back so your whole body fits, head to toe, inside the frame.",
    tips: [
      "Stand 6–8 ft from the camera",
      "Both feet and top of head must be visible",
      "Arms relaxed at your sides",
      "A plain wall or door behind you works best"
    ],
    guide: "body",
    required: true,
    camera: "environment"
  },
  {
    label: "front",
    title: "Look straight",
    instruction: "Face the camera straight on, with your whole face in the oval.",
    tips: [
      "Look directly into the camera lens",
      "Keep your head level — don't tilt",
      "Relax your jaw and expression",
      "Even lighting from the front gives the best result"
    ],
    guide: "face",
    facing: "front",
    required: true,
    camera: "user"
  },
  {
    label: "left",
    title: "Turn left",
    instruction: "Keep still and slowly turn your head to your left.",
    tips: [
      "Rotate your head, not your shoulders",
      "Stop at a comfortable natural angle",
      "Keep your chin level as you turn"
    ],
    guide: "face",
    facing: "left",
    required: false,
    camera: "user"
  },
  {
    label: "right",
    title: "Turn right",
    instruction: "Now slowly turn your head to your right.",
    tips: [
      "Mirror the left turn — same angle, other side",
      "Shoulders stay forward",
      "Keep your chin level as you turn"
    ],
    guide: "face",
    facing: "right",
    required: false,
    camera: "user"
  },
  {
    label: "up_left",
    title: "Up & left",
    instruction: "Tilt your chin up and look up toward your left.",
    tips: [
      "Tilt chin up first, then turn left",
      "A slight angle is enough — don't overdo it",
      "Keep your face inside the oval"
    ],
    guide: "face",
    facing: "up_left",
    required: false,
    camera: "user"
  },
  {
    label: "up_right",
    title: "Up & right",
    instruction: "Still looking up, turn toward your right.",
    tips: [
      "Same chin-up tilt, other direction",
      "Move slowly between angles",
      "Keep your face inside the oval"
    ],
    guide: "face",
    facing: "up_right",
    required: false,
    camera: "user"
  },
  {
    label: "down_left",
    title: "Down & left",
    instruction: "Lower your chin and look down toward your left.",
    tips: [
      "Drop your chin, then turn left",
      "Keep eyes visible in the frame",
      "Hold still when you capture"
    ],
    guide: "face",
    facing: "down_left",
    required: false,
    camera: "user"
  },
  {
    label: "down_right",
    title: "Down & right",
    instruction: "Still looking down, turn toward your right.",
    tips: [
      "Same chin-down angle, other direction",
      "Keep eyes visible in the frame",
      "Hold still when you capture"
    ],
    guide: "face",
    facing: "down_right",
    required: false,
    camera: "user"
  }
];

const STEP_BY_LABEL = new Map(CAPTURE_STEPS.map((s) => [s.label, s]));

export function isValidLabel(label: string): boolean {
  return STEP_BY_LABEL.has(label);
}

/** Stable sort order = the step's index in the rundown. */
export function stepOrder(label: string): number {
  return CAPTURE_STEPS.findIndex((s) => s.label === label);
}

export const REQUIRED_LABELS = CAPTURE_STEPS.filter((s) => s.required).map((s) => s.label);

/** Setup is "complete" once every required shot (canvas + front face) is present. */
export function isSetupComplete(labels: string[]): boolean {
  const have = new Set(labels);
  return REQUIRED_LABELS.every((l) => have.has(l));
}
