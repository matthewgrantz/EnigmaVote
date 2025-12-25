import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "EnigmaVote",
  projectId: "3f1f219d1f964ec686a9a05a753d0c27",
  chains: [sepolia],
  ssr: false,
});
