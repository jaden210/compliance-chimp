import { Composition } from "remotion";
import { AdCreative } from "./Composition";
import {
  RoofingCrewProtectionCreative,
  RoofingFearLossCreative,
  RoofingWinWorkCreative,
} from "./RoofingAds";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AdCreative"
        component={AdCreative}
        durationInFrames={450}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="RoofingFearLossCreative"
        component={RoofingFearLossCreative}
        durationInFrames={450}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="RoofingWinWorkCreative"
        component={RoofingWinWorkCreative}
        durationInFrames={450}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="RoofingCrewProtectionCreative"
        component={RoofingCrewProtectionCreative}
        durationInFrames={450}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
