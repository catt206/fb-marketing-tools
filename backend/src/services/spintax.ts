export type SpinResult = {
  text: string;
  variantsEstimate: number;
};

type Node =
  | { type: "text"; value: string }
  | { type: "choice"; options: Node[][] };

function parseSpintax(input: string): Node[] {
  let index = 0;

  const parseSequence = (stopChar?: string): Node[] => {
    const nodes: Node[] = [];
    let buffer = "";

    const flushBuffer = () => {
      if (buffer.length > 0) {
        nodes.push({ type: "text", value: buffer });
        buffer = "";
      }
    };

    while (index < input.length) {
      const ch = input[index];
      if (stopChar && ch === stopChar) {
        break;
      }
      if (ch === "{") {
        flushBuffer();
        index += 1;
        nodes.push(parseChoice());
        continue;
      }
      if (ch === "}") {
        break;
      }
      buffer += ch;
      index += 1;
    }

    flushBuffer();
    return nodes;
  };

  const parseChoice = (): Node => {
    const options: Node[][] = [];
    while (index < input.length) {
      const optionNodes = parseSequence("|");
      options.push(optionNodes);
      if (input[index] === "|") {
        index += 1;
        continue;
      }
      if (input[index] === "}") {
        index += 1;
        break;
      }
      break;
    }
    return { type: "choice", options };
  };

  return parseSequence();
}

function render(nodes: Node[]): { text: string; variantsEstimate: number } {
  let text = "";
  let variantsEstimate = 1;
  for (const node of nodes) {
    if (node.type === "text") {
      text += node.value;
      continue;
    }
    const optionResults = node.options.map((opt) => render(opt));
    if (optionResults.length === 0) {
      continue;
    }
    const chosen = optionResults[Math.floor(Math.random() * optionResults.length)] ?? optionResults[0]!;
    text += chosen.text;

    const optionVariants = optionResults.reduce((sum, r) => sum + r.variantsEstimate, 0);
    variantsEstimate *= Math.max(1, optionVariants);
  }
  return { text, variantsEstimate };
}

export function spinText(input: string): SpinResult {
  const ast = parseSpintax(input);
  const result = render(ast);
  return { text: result.text.trim(), variantsEstimate: result.variantsEstimate };
}
