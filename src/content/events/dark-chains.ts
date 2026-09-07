import type {Card,Run}from '../../game/types';

/**
 * 桩：将被工程师 B 的实现替换，签名不得改。
 *
 * 引擎侧的接线（engine.ts `interrupt()` 与 `stop()`，工程师 A 已接好，B 合并后不必再动引擎）：
 *
 * 1. SAN 或体力再次归零时，引擎在 `stop(r, kind)` 之前调用 `darkChainEntry(r, kind)`。
 *    返回 `undefined`：引擎按原流程立即收口。
 *    返回一张卡：引擎把这张卡插到当前位置作为急性事件卡（`r.emergency.vital === kind`），
 *    写入事实 `dark-chain:<kind>`，本局继续；在该事实存在期间，同一项归零不再重复触发，也不收口。
 *    链的后续事件（E-231／E-232／E-239／E-240 等）由 B 在 director 里按普通事件排期。
 * 2. 链开着的时候，引擎在每次 `interrupt()`（每个动作之后、无急性卡待处理时）与 `stop()`
 *    （`settleAuthoredEvents(final)` 之后）调用 `darkChainResolve(r)`。B 在链末的无选项结算步骤
 *    （E-232／E-236／E-239）里写入结果事实（`精神-无法复岗`、`身体-抢救无效`、`自杀-死亡确认` 等），
 *    并写入 `dark-chain-resolved:<kind>`；引擎读到这个事实就 `stop(r, kind)`，结局由
 *    `earlyEnding` 按合同第二节的优先级选取。
 * 3. 鉴定庭路径（D15 `testify`）只经过 `settleAuthoredEvents(r,'日终',true)`，本局收口的链结果
 *    请在那里（director）或 `darkChainResolve` 里写完；`tribunalEnding` 只读事实。
 */
export function darkChainEntry(r:Run,kind:'san'|'stamina'):Card|undefined{
  void r;void kind;
  return undefined;
}
export function darkChainResolve(r:Run):void{
  void r;
}
