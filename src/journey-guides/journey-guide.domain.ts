export type GuideStatus='DRAFT'|'UNDER_REVIEW'|'PUBLISHED'|'NEEDS_REVIEW'|'RETIRED';
const allowed:Record<GuideStatus,GuideStatus[]>={DRAFT:['UNDER_REVIEW'],UNDER_REVIEW:['PUBLISHED','DRAFT'],PUBLISHED:['NEEDS_REVIEW'],NEEDS_REVIEW:['UNDER_REVIEW','RETIRED'],RETIRED:[]};
export function assertGuideTransition(from:GuideStatus,to:GuideStatus){if(!allowed[from].includes(to))throw new Error(`Invalid guide transition: ${from} -> ${to}`)}
export type ResolutionCandidate={originScopeType:'TOWN'|'LGA'|'TRAVEL_HUB'|'STATE_AREA';version:number;publishedAt:Date|null};
export function chooseMostSpecific<T extends ResolutionCandidate>(rows:T[]){const rank={TOWN:1,LGA:2,TRAVEL_HUB:3,STATE_AREA:4};return [...rows].sort((a,b)=>rank[a.originScopeType]-rank[b.originScopeType]||b.version-a.version||(b.publishedAt?.getTime()??0)-(a.publishedAt?.getTime()??0))[0]??null}
export function staleBefore(now=new Date(),days=Number(process.env.GUIDE_REVIEW_AFTER_DAYS??180)){return new Date(now.getTime()-days*86_400_000)}
