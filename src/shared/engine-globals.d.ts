// The structured clone algorithm is available in both supported hosts. No DOM
// types, timers, storage globals or randomness are exposed by this declaration.
declare function structuredClone<T>(value:T):T;
