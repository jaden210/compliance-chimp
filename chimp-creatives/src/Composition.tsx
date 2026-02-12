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
  orange: "#ff9100",
  white: "#ffffff",
  lightBg: "#f0f4f8",
};

export const AdCreative: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- Scene timing (frames) ---
  const scene1End = fps * 4; // 0–4s: Headline + chimp entrance
  const scene2Start = scene1End;
  const scene2End = scene2Start + fps * 4; // 4–8s: Features
  const scene3Start = scene2End;
  const scene3End = scene3Start + fps * 4; // 8–12s: Social proof
  const ctaStart = scene3End; // 12–15s: CTA

  // --- Animations ---
  const logoScale = spring({ frame, fps, from: 0, to: 1, durationInFrames: 20 });
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const headlineY = spring({ frame: frame - 10, fps, from: 60, to: 0, durationInFrames: 25 });
  const headlineOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: "clamp" });

  const chimpX = spring({ frame: frame - 20, fps, from: 300, to: 0, durationInFrames: 30 });
  const chimpOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });

  // Scene 2: Features
  const features = [
    "Automated Compliance Tracking",
    "Real-Time Team Monitoring",
    "Instant Audit Reports",
  ];

  // Scene 3: Social proof
  const scene3Opacity = interpolate(frame, [scene3Start, scene3Start + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scene3Y = spring({
    frame: frame - scene3Start,
    fps,
    from: 40,
    to: 0,
    durationInFrames: 20,
  });

  // CTA
  const ctaOpacity = interpolate(frame, [ctaStart, ctaStart + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaScale = spring({
    frame: frame - ctaStart,
    fps,
    from: 0.8,
    to: 1,
    durationInFrames: 20,
  });
  const ctaPulse =
    frame > ctaStart + 20
      ? 1 + 0.03 * Math.sin((frame - ctaStart - 20) * 0.15)
      : ctaScale;

  // Background gradient shift
  const gradientAngle = interpolate(frame, [0, 450], [135, 180], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientAngle}deg, ${BRAND.blue} 0%, #063f6e 50%, #032a4a 100%)`,
        fontFamily: "'Nunito', 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Subtle animated background circles */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND.orange}15 0%, transparent 70%)`,
          transform: `scale(${1 + 0.1 * Math.sin(frame * 0.02)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -150,
          left: -150,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND.blue}30 0%, transparent 70%)`,
          transform: `scale(${1 + 0.08 * Math.sin(frame * 0.025 + 1)})`,
        }}
      />

      {/* ===== SCENE 1: Logo + Headline + Chimp (0–4s) ===== */}
      {frame < scene2End && (
        <AbsoluteFill
          style={{
            opacity: frame > scene1End ? interpolate(frame, [scene1End, scene1End + 15], [1, 0], { extrapolateRight: "clamp" }) : 1,
          }}
        >
          {/* Logo top-left */}
          <div
            style={{
              position: "absolute",
              top: 40,
              left: 50,
              opacity: logoOpacity,
              transform: `scale(${logoScale})`,
            }}
          >
            <Img
              src={staticFile("complianceChimpLogo.png")}
              style={{ height: 50 }}
            />
          </div>

          {/* Main headline */}
          <div
            style={{
              position: "absolute",
              top: 180,
              left: 80,
              width: 650,
              opacity: headlineOpacity,
              transform: `translateY(${headlineY}px)`,
            }}
          >
            <h1
              style={{
                color: BRAND.white,
                fontSize: 54,
                fontWeight: 800,
                lineHeight: 1.15,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              Compliance
              <br />
              <span style={{ color: BRAND.orange }}>Made Simple.</span>
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: 22,
                marginTop: 20,
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              Stop chasing paperwork. Let the Chimp
              <br />
              handle your team's compliance.
            </p>
          </div>

          {/* Chimp mascot */}
          <div
            style={{
              position: "absolute",
              right: 40,
              bottom: 20,
              opacity: chimpOpacity,
              transform: `translateX(${chimpX}px)`,
            }}
          >
            <Img
              src={staticFile("chimpThumbsup.png")}
              style={{ height: 480 }}
            />
          </div>
        </AbsoluteFill>
      )}

      {/* ===== SCENE 2: Features (4–8s) ===== */}
      {frame >= scene2Start && frame < scene3End && (
        <AbsoluteFill
          style={{
            opacity:
              frame < scene2End
                ? interpolate(frame, [scene2Start, scene2Start + 15], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : interpolate(frame, [scene2End, scene2End + 15], [1, 0], {
                    extrapolateRight: "clamp",
                  }),
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {features.map((feature, i) => {
              const delay = scene2Start + 10 + i * 15;
              const featureOpacity = interpolate(frame, [delay, delay + 15], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const featureX = spring({
                frame: frame - delay,
                fps,
                from: -80,
                to: 0,
                durationInFrames: 20,
              });
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    opacity: featureOpacity,
                    transform: `translateX(${featureX}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: BRAND.orange,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 26,
                      color: BRAND.white,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </div>
                  <span
                    style={{
                      color: BRAND.white,
                      fontSize: 36,
                      fontWeight: 700,
                    }}
                  >
                    {feature}
                  </span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* ===== SCENE 3: Social Proof (8–12s) ===== */}
      {frame >= scene3Start && frame < ctaStart + 15 && (
        <AbsoluteFill
          style={{
            opacity:
              frame < ctaStart
                ? scene3Opacity
                : interpolate(frame, [ctaStart, ctaStart + 15], [1, 0], {
                    extrapolateRight: "clamp",
                  }),
            justifyContent: "center",
            alignItems: "center",
            transform: `translateY(${scene3Y}px)`,
          }}
        >
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                color: BRAND.orange,
                lineHeight: 1,
              }}
            >
              500+
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 600,
                color: BRAND.white,
                opacity: 0.9,
              }}
            >
              Teams Trust Compliance Chimp
            </div>
            <div
              style={{
                display: "flex",
                gap: 40,
                marginTop: 20,
              }}
            >
              {[
                { label: "Hours Saved", value: "10K+" },
                { label: "Audit Pass Rate", value: "99%" },
                { label: "Satisfaction", value: "4.9★" },
              ].map((stat, i) => {
                const statDelay = scene3Start + 15 + i * 10;
                const statOpacity = interpolate(
                  frame,
                  [statDelay, statDelay + 12],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                );
                return (
                  <div
                    key={i}
                    style={{
                      textAlign: "center",
                      opacity: statOpacity,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: BRAND.white,
                      }}
                    >
                      {stat.value}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 500,
                        marginTop: 4,
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ===== SCENE 4: CTA (12–15s) ===== */}
      {frame >= ctaStart && (
        <AbsoluteFill
          style={{
            opacity: ctaOpacity,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 30,
            }}
          >
            <Img
              src={staticFile("complianceChimpLogo.png")}
              style={{
                height: 60,
                opacity: ctaOpacity,
              }}
            />
            <h2
              style={{
                color: BRAND.white,
                fontSize: 48,
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Ready to Simplify
              <br />
              <span style={{ color: BRAND.orange }}>Compliance?</span>
            </h2>
            <div
              style={{
                background: BRAND.orange,
                color: BRAND.white,
                fontSize: 28,
                fontWeight: 700,
                padding: "18px 50px",
                borderRadius: 50,
                transform: `scale(${ctaPulse})`,
                boxShadow: `0 8px 30px ${BRAND.orange}60`,
              }}
            >
              Start Free Trial
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 18,
                fontWeight: 500,
              }}
            >
              compliancechimp.com
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
