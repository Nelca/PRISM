import LedgerPage from "../page";

export default function LedgerHistoryPage() {
  return <LedgerPage searchParams={Promise.resolve({})} section="history" />;
}
