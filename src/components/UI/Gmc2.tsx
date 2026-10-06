import { shortAmount } from "@/lib/format";

/** Montant court suivi du logo de la monnaie GMC2 (4M ◆, 480k ◆). */
export default function Gmc2({ value }: { value: number }) {
  return (
    <span className="gmc2">
      {shortAmount(value)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gmc2.png" alt="GMC2" width={14} height={14} />
    </span>
  );
}
