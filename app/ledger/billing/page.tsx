import LedgerPage from "../page";

export default function LedgerBillingPage() {
  return <LedgerPage searchParams={Promise.resolve({})} section="billing" />;
}
