import LedgerPage from "../page";

export default function LedgerParameterVersionsPage({ searchParams }: { searchParams: Promise<{ compareWith?: string }> }) {
  return <LedgerPage searchParams={searchParams} section="parameter-versions" />;
}
