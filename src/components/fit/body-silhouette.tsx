import { computeBodyShape, type BodyType } from "@/lib/fit/measurements";

type BodySilhouetteProps = {
  heightCm?: number | null;
  weightKg?: number | null;
  bodyType?: BodyType | null;
  className?: string;
};

const CENTER = 60;
const FEET_Y = 242;

// Builds the closed torso + legs outline. All horizontal positions are mirrored
// around CENTER, so the figure stays symmetric as the half-widths change.
function bodyOutline(s: ReturnType<typeof computeBodyShape>): string {
  const L = (half: number) => CENTER - half;
  const R = (half: number) => CENTER + half;
  const { shoulderHalf, waistHalf, hipHalf, neckHalf, ankleHalf } = s;
  const gap = 3.6; // half-width of the crotch / inner-ankle gap

  return [
    `M ${R(neckHalf)} 46`,
    `C ${R(neckHalf)} 52 ${R(shoulderHalf)} 54 ${R(shoulderHalf)} 62`,
    `C ${R(shoulderHalf)} 86 ${R(waistHalf)} 100 ${R(waistHalf)} 116`,
    `C ${R(waistHalf)} 130 ${R(hipHalf)} 140 ${R(hipHalf)} 150`,
    `L ${R(ankleHalf + 1)} 198`,
    `L ${R(ankleHalf)} ${FEET_Y}`,
    `L ${R(gap)} ${FEET_Y}`,
    `L ${R(gap)} 156`,
    `L ${CENTER} 150`,
    `L ${L(gap)} 156`,
    `L ${L(gap)} ${FEET_Y}`,
    `L ${L(ankleHalf)} ${FEET_Y}`,
    `L ${L(ankleHalf + 1)} 198`,
    `L ${L(hipHalf)} 150`,
    `C ${L(hipHalf)} 140 ${L(waistHalf)} 130 ${L(waistHalf)} 116`,
    `C ${L(waistHalf)} 100 ${L(shoulderHalf)} 86 ${L(shoulderHalf)} 62`,
    `C ${L(shoulderHalf)} 54 ${L(neckHalf)} 52 ${L(neckHalf)} 46`,
    "Z"
  ].join(" ");
}

// One hanging arm, tapering from the shoulder to the wrist near the hip. `side`
// is +1 for the right arm, -1 for the left.
function armOutline(s: ReturnType<typeof computeBodyShape>, side: 1 | -1): string {
  const x = (offset: number) => CENTER + side * offset;
  const { shoulderHalf, waistHalf } = s;

  return [
    `M ${x(shoulderHalf - 2)} 64`,
    `C ${x(shoulderHalf + 5)} 92 ${x(waistHalf + 9)} 122 ${x(waistHalf + 7)} 150`,
    `L ${x(waistHalf + 1)} 150`,
    `C ${x(waistHalf + 2)} 122 ${x(shoulderHalf - 3)} 94 ${x(shoulderHalf - 7)} 70`,
    "Z"
  ].join(" ");
}

export function BodySilhouette({
  heightCm,
  weightKg,
  bodyType,
  className
}: BodySilhouetteProps) {
  const shape = computeBodyShape({ heightCm, weightKg, bodyType });
  // Scale the figure vertically about the feet so height changes are visible
  // without distorting widths.
  const transform = `translate(${CENTER} ${FEET_Y}) scale(1 ${shape.heightScale.toFixed(
    3
  )}) translate(${-CENTER} ${-FEET_Y})`;

  return (
    <svg
      className={className}
      viewBox="0 0 120 250"
      role="img"
      aria-label="Body silhouette preview"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform={transform} className="silhouette-figure">
        <ellipse cx={CENTER} cy={30} rx={14} ry={16} />
        <path d={armOutline(shape, 1)} />
        <path d={armOutline(shape, -1)} />
        <path d={bodyOutline(shape)} />
      </g>
    </svg>
  );
}
