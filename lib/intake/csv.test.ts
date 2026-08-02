import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("単純なカンマ区切りの行を解析する", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("引用符で囲まれたフィールド内のカンマを区切りとして扱わない", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("引用符内のエスケープされた引用符(\"\")を1つの引用符として扱う", () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([["a", 'say "hi"', "c"]]);
  });

  it("引用符内の改行をフィールドの一部として扱う", () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([["a", "line1\nline2", "c"]]);
  });

  it("CRLF改行に対応する", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("末尾の改行は空行を追加しない", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("空文字列は空配列を返す", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("日本語フィールドをそのまま扱う", () => {
    expect(parseCsv("拠点ID,名称\nsite-001,本社工場")).toEqual([
      ["拠点ID", "名称"],
      ["site-001", "本社工場"],
    ]);
  });
});
