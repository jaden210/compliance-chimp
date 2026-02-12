import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const BRAND = {
  blue: "#054d8a",
  darkBlue: "#032a4a",
  orange: "#ff9100",
  white: "#ffffff",
};

type RoofingAdConfig = {
  kicker: string;
  headline: string;
  subheadline: string;
  proofStats: [string, string, string];
  proofSourcesFooter: string;
  outcomesTitle: string;
  outcomes: [string, string, string];
  ctaTitle: string;
  ctaButton: string;
  ctaFooter: string;
};

const adFade = (frame: number, start: number, end: number) => {
  const fadeIn = interpolate(frame, [start, start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [end - 12, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return fadeIn * fadeOut;
};

const RoofingAdTemplate: React.FC<{ config: RoofingAdConfig }> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scene1Start = 0;
  const scene1End = fps * 4;
  const scene2Start = scene1End;
  const scene2End = scene2Start + fps * 4;
  const scene3Start = scene2End;
  const scene3End = scene3Start + fps * 4;
  const scene4Start = scene3End;
  const scene4End = fps * 15;

  const gradientAngle = interpolate(frame, [0, scene4End], [132, 175], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const mascotX = spring({
    frame: frame - 18,
    fps,
    from: 220,
    to: 0,
    durationInFrames: 26,
  });
  const mascotOpacity = interpolate(frame, [16, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientAngle}deg, ${BRAND.blue} 0%, #063f6e 52%, ${BRAND.darkBlue} 100%)`,
        fontFamily: "'Nunito', 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          top: -170,
          right: -140,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND.orange}22 0%, transparent 70%)`,
          transform: `scale(${1 + 0.08 * Math.sin(frame * 0.018)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 640,
          height: 640,
          bottom: -230,
          left: -180,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND.white}10 0%, transparent 72%)`,
          transform: `scale(${1 + 0.05 * Math.sin(frame * 0.02 + 0.9)})`,
        }}
      />

      {/* Scene 1: Hook */}
      <AbsoluteFill
        style={{
          opacity: adFade(frame, scene1Start, scene1End),
          padding: "44px 62px",
        }}
      >
        <div style={{ width: 280 }}>
          <Img
            src={staticFile("complianceChimpLogo.png")}
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              opacity: interpolate(frame, [0, 14], [0, 1], {
                extrapolateRight: "clamp",
              }),
            }}
          />
        </div>

        <div style={{ marginTop: 46, maxWidth: 760 }}>
          <div
            style={{
              color: BRAND.orange,
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            {config.kicker}
          </div>
          <h1
            style={{
              margin: 0,
              color: BRAND.white,
              fontSize: 66,
              lineHeight: 1.08,
              fontWeight: 900,
              letterSpacing: -1.2,
              whiteSpace: "pre-line",
            }}
          >
            {config.headline}
          </h1>
          <p
            style={{
              marginTop: 20,
              marginBottom: 0,
              color: "rgba(255,255,255,0.9)",
              fontSize: 28,
              lineHeight: 1.35,
              fontWeight: 500,
            }}
          >
            {config.subheadline}
          </p>
        </div>

        <div
          style={{
            position: "absolute",
            right: 26,
            bottom: 6,
            transform: `translateX(${mascotX}px)`,
            opacity: mascotOpacity,
          }}
        >
          <Img src={staticFile("chimpThumbsup.png")} style={{ height: 368 }} />
        </div>
      </AbsoluteFill>

      {/* Scene 2: Proof metrics */}
      <AbsoluteFill
        style={{
          opacity: adFade(frame, scene2Start, scene2End),
          justifyContent: "center",
          alignItems: "center",
          padding: "20px 60px",
          gap: 18,
        }}
      >
        <div
          style={{
            color: BRAND.white,
            fontSize: 46,
            fontWeight: 850,
            letterSpacing: -0.5,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Real Roofing Risk Data
        </div>

        {config.proofStats.map((item, index) => {
          const rowStart = scene2Start + 8 + index * 10;
          const rowOpacity = interpolate(frame, [rowStart, rowStart + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const rowX = spring({
            frame: frame - rowStart,
            fps,
            from: -70,
            to: 0,
            durationInFrames: 14,
          });

          return (
            <div
              key={item}
              style={{
                width: 1120,
                borderRadius: 18,
                background: "rgba(255,255,255,0.13)",
                border: "1px solid rgba(255,255,255,0.22)",
                padding: "18px 22px",
                opacity: rowOpacity,
                transform: `translateX(${rowX}px)`,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  minWidth: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: BRAND.orange,
                  color: BRAND.white,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 20,
                }}
              >
                ✓
              </div>
              <div>
                <div
                  style={{
                    color: BRAND.white,
                    fontSize: 34,
                    fontWeight: 800,
                    lineHeight: 1.18,
                  }}
                >
                  {item}
                </div>
              </div>
            </div>
          );
        })}
        <div
          style={{
            marginTop: 6,
            color: "rgba(255,255,255,0.72)",
            fontSize: 17,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Sources: {config.proofSourcesFooter}
        </div>
      </AbsoluteFill>

      {/* Scene 3: Outcomes */}
      <AbsoluteFill
        style={{
          opacity: adFade(frame, scene3Start, scene3End),
          justifyContent: "center",
          alignItems: "center",
          padding: "20px 70px",
        }}
      >
        <div
          style={{
            width: 1120,
            borderRadius: 28,
            background: "rgba(0, 0, 0, 0.2)",
            border: "1px solid rgba(255,255,255,0.22)",
            padding: "34px 42px 36px",
          }}
        >
          <div
            style={{
              color: BRAND.orange,
              fontSize: 24,
              fontWeight: 800,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {config.outcomesTitle}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
            }}
          >
            {config.outcomes.map((outcome, index) => {
              const lineStart = scene3Start + 6 + index * 8;
              const lineOpacity = interpolate(frame, [lineStart, lineStart + 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={outcome}
                  style={{
                    color: BRAND.white,
                    fontSize: 38,
                    fontWeight: 750,
                    lineHeight: 1.22,
                    opacity: lineOpacity,
                  }}
                >
                  • {outcome}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      {/* Scene 4: CTA */}
      <AbsoluteFill
        style={{
          opacity: adFade(frame, scene4Start, scene4End),
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: "20px 70px",
        }}
      >
        <div style={{ width: 300 }}>
          <Img
            src={staticFile("complianceChimpLogo.png")}
            style={{ width: "100%", height: "auto", objectFit: "contain" }}
          />
        </div>
        <h2
          style={{
            margin: "24px 0 12px",
            color: BRAND.white,
            fontSize: 56,
            lineHeight: 1.12,
            fontWeight: 900,
            letterSpacing: -1,
            maxWidth: 1020,
          }}
        >
          {config.ctaTitle}
        </h2>
        <div
          style={{
            marginTop: 14,
            background: BRAND.orange,
            color: BRAND.white,
            borderRadius: 999,
            padding: "16px 44px",
            fontWeight: 850,
            fontSize: 34,
            boxShadow: `0 10px 28px ${BRAND.orange}66`,
            transform: `scale(${1 + 0.02 * Math.sin((frame - scene4Start) * 0.18)})`,
          }}
        >
          {config.ctaButton}
        </div>
        <div
          style={{
            marginTop: 16,
            color: "rgba(255,255,255,0.86)",
            fontSize: 25,
            fontWeight: 600,
          }}
        >
          {config.ctaFooter}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const fearLossConfig: RoofingAdConfig = {
  kicker: "Roofing Owner Alert",
  headline: "Protect Margin\nFrom OSHA Penalties",
  subheadline: "One citation can wipe out profit from multiple jobs.",
  proofStats: [
    "OSHA FY2024: Fall Protection is #1 cited standard",
    "2025 max penalties: $16,550 serious | $165,514 willful/repeated",
    "Roofing had 110 fatal falls/slips/trips in 2023 (BLS)",
  ],
  proofSourcesFooter: "OSHA Top 10 FY2024, OSHA 2025 penalty memo, BLS TED May 2025",
  outcomesTitle: "What small roofing teams need",
  outcomes: [
    "Training by text for field crews",
    "Automatic tracking without spreadsheets",
    "Inspection-ready records in one place",
  ],
  ctaTitle: "Avoid avoidable penalties. Get compliant faster.",
  ctaButton: "Start 14-Day Free Trial",
  ctaFooter: "compliancechimp.com/lp/roofing-contractors",
};

const winWorkConfig: RoofingAdConfig = {
  kicker: "Documentation Wins Jobs",
  headline: "Move Faster\nWith Better Safety Records",
  subheadline: "Respond to safety document requests faster.",
  proofStats: [
    "Roofing: 110 fatal falls/slips/trips in 2023 (BLS)",
    "OSHA FY2024: Fall Protection #1, Ladders #3",
    "OSHA Safety Pays: indirect injury costs are usually uninsured",
  ],
  proofSourcesFooter: "BLS TED May 2025, OSHA Top 10 FY2024, OSHA Safety Pays background",
  outcomesTitle: "Built for small roofing operations",
  outcomes: [
    "Centralize training and documentation",
    "Reduce last-minute inspection scramble",
    "Show a consistent safety process",
  ],
  ctaTitle: "Get roofing documentation under control.",
  ctaButton: "Get OSHA-Ready Now",
  ctaFooter: "No credit card required to start",
};

const crewProtectionConfig: RoofingAdConfig = {
  kicker: "Crew Safety First",
  headline: "Protect Your Crew\nWithout Admin Chaos",
  subheadline: "Simple workflows to train, track, and stay ready.",
  proofStats: [
    "Roofing had 110 fatal falls/slips/trips in 2023 (highest in construction)",
    "OSHA FY2024 top 10 includes Fall Protection Training (1926.503)",
    "2025 OSHA max serious penalty: $16,550 per violation",
  ],
  proofSourcesFooter: "BLS TED May 2025, OSHA Top 10 FY2024, OSHA 2025 penalty memo",
  outcomesTitle: "Practical for field crews",
  outcomes: [
    "Deliver training by text and email",
    "Use repeatable safety reminders",
    "Stay ready if OSHA shows up",
  ],
  ctaTitle: "Protect people. Protect profit. Start today.",
  ctaButton: "Start Free Trial",
  ctaFooter: "Compliance Chimp for Roofing Contractors",
};

export const RoofingFearLossCreative: React.FC = () => (
  <RoofingAdTemplate config={fearLossConfig} />
);

export const RoofingWinWorkCreative: React.FC = () => (
  <RoofingAdTemplate config={winWorkConfig} />
);

export const RoofingCrewProtectionCreative: React.FC = () => (
  <RoofingAdTemplate config={crewProtectionConfig} />
);
