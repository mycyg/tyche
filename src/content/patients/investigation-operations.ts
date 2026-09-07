import type { Option } from '../../game/types';

type Operation = NonNullable<Option['mechanics']>['operation'];
/** Reviewed against each preset's actual key-check action, not label matching
 * at runtime. Reading a prescription or explaining refusal is not a new test. */
const groups: Partial<Record<Operation, number[]>> = {
  history: [6, 8, 9, 10, 11, 30, 33, 35, 36, 41, 46, 56, 58, 65, 68, 74, 75, 76, 78, 80, 85, 90, 92, 98, 99, 100, 101, 103, 104, 105, 106, 109, 110, 111, 114, 121, 122, 130, 145, 159, 161, 166, 171, 180, 184, 187, 189, 192, 193, 195, 196, 198, 202, 206, 208],
  observe: [12, 14, 15, 16, 21, 26, 29, 34, 40, 42, 43, 44, 45, 47, 48, 49, 52, 57, 59, 60, 61, 63, 71, 87, 91, 93, 94, 95, 96, 97, 102, 107, 108, 112, 113, 115, 116, 117, 118, 119, 123, 124, 125, 126, 127, 129, 132, 136, 141, 144, 147, 150, 157, 170, 172, 174, 175, 176, 177, 178, 182, 183, 190, 200, 201, 204],
  'full-exam': [128],
  comfort: [4, 17, 66, 77, 138, 143, 163, 169, 207],
  consult: [53, 167, 181, 188],
  treatment: [64],
  'progress-record': [131],
  other: [179, 194],
};
const operations = new Map(Object.entries(groups).flatMap(([operation, ids]) => ids!.map(id => [id, operation as Operation] as const)));
export function investigationOperation(id: string): Operation {
  return operations.get(Number(id.slice(2))) ?? 'exam';
}
