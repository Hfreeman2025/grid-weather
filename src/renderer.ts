import type { Boundary } from './geometry.ts';
import { pathData, VIEW } from './geometry.ts';
export function setupMap(
  svg: SVGSVGElement,
  boundaries: Boundary[],
  select: (id: number) => void,
): Map<number, SVGPathElement> {
  svg.setAttribute('viewBox', `0 0 ${VIEW.width} ${VIEW.height}`);
  const paths = new Map<number, SVGPathElement>();
  for (const b of boundaries) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData(b));
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.setAttribute('aria-label', b.name);
    path.dataset.id = String(b.id);
    path.addEventListener('click', () => select(b.id));
    path.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(b.id);
      }
    });
    svg.append(path);
    paths.set(b.id, path);
  }
  return paths;
}
