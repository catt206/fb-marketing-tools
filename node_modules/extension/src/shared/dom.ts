export function mustGetElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
}

export function setText(id: string, text: string) {
  mustGetElement<HTMLElement>(id).textContent = text;
}

export function setHtml(id: string, html: string) {
  mustGetElement<HTMLElement>(id).innerHTML = html;
}

