/**
 * 出力API(build-plan §6「出力API」、構想書10.4「フェーズ3のERP埋め込みに備えて形だけ用意」)。
 * 現時点ではダミーデータのパイプライン結果をそのまま返すのみで、認証・書き込みは行わない。
 */
import { runDemoPipeline } from "@/lib/demo/run-demo-pipeline";

export async function GET() {
  const result = runDemoPipeline();
  return Response.json(result);
}
