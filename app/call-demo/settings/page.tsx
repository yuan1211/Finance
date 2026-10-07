"use client";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import SafetySettings from "../safety-settings";
import styles from "../page.module.css";
const subscribe = () => () => {};

export default function FamilySettingsPage() {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return <div className={styles.screen}>{ready ? <SafetySettings onClose={() => router.push("/")} /> : <p role="status">저장된 설정을 불러오고 있어요.</p>}</div>;
}
