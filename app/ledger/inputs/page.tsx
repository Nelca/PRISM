import LedgerPage from "../page";

export default function LedgerInputsPage() {
  return <LedgerPage searchParams={Promise.resolve({})} section="inputs" />;
}
