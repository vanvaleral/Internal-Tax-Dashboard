import { VirtualOffice } from "@/components/office/virtual-office";

export default function OfficePage() {
  return <VirtualOffice gameEnabled={process.env.VIRTUAL_OFFICE_GAME_ENABLED !== "false"} voiceEnabled={process.env.VIRTUAL_OFFICE_VOICE_ENABLED !== "false"} />;
}
