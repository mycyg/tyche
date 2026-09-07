/** Fatigue changes the first reading, not access to the clinical evidence.
 * Copy complete source clauses so a negative or unconfirmed result stays so. */
export function reportReviewLines(full:string,skimmed:string):string[] {
  const clauses=full.match(/[^。；\n]+[。；]?/g)??[full];
  return [...new Set(clauses.map(s=>s.trim()).filter(s=>s&&!skimmed.includes(s)&&
    /\d|危急|阳性|阴性|未排除|不能排除|尚未|未完成|未回报|未出具|待|延迟|出血|缺血|坏死|血栓|异常|不明|拒绝|静音|封存|记录/.test(s)))];
}
