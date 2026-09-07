/** Fixed identities in 04_病例库, §2 呈现. C019's chart is anchored to
 * the pregnant mother; its graph continues to triage all three family members. */
export const CLINICAL_IDENTITIES:Record<string,{age:number;sex:'男'|'女';pregnant?:boolean;members?:string[]}>={
 C001:{age:14/12,sex:'男'},C002:{age:48,sex:'男'},C003:{age:71,sex:'女'},C004:{age:68,sex:'女'},
 C005:{age:26,sex:'女'},C006:{age:24,sex:'男'},C007:{age:2.25,sex:'男'},C008:{age:7/12,sex:'女'},
 C009:{age:72,sex:'女'},C010:{age:67,sex:'男'},C011:{age:24,sex:'女'},C012:{age:76,sex:'男'},
 C013:{age:52,sex:'男'},C014:{age:2+4/12,sex:'女'},C015:{age:58,sex:'男'},C016:{age:31,sex:'男'},
 C017:{age:66,sex:'男'},C018:{age:29,sex:'女'},C019:{age:39,sex:'女',pregnant:true,members:['父亲，42岁','母亲，39岁，孕24周','女儿，8岁']},C020:{age:74,sex:'男'},
};
export function patientAgeLabel(age:number):string {
 if(age<1/12)return `${Math.max(0,Math.round(age*365))} 天`;
 const months=Math.round(age*12);
 if(age<2)return `${months} 个月`;
 if(age<6&&months%12)return `${Math.floor(months/12)} 岁 ${months%12} 个月`;
 return `${Number.isInteger(age)?age:Math.floor(age)} 岁`;
}
