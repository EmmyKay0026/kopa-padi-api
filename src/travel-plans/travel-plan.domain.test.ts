import { describe,expect,it } from 'vitest'; import { calculateExpiry,isValidTravelDate,lagosToday } from './travel-plan.domain.js'; import { travelPlanInputSchema } from './travel-plan.schemas.js';
const future='2099-09-14';const valid={originStateId:'NG017',originLgaId:'NG017025',originTownId:null,intendedTravelDate:future,dateFlexibilityDays:1,departureWindow:'MORNING',transportMode:'COMMERCIAL_BUS',transportFlexible:false,nearbyMatchingEnabled:true,groupPreference:'ANY_VERIFIED_PCM'};
describe('travel plan input contract',()=>{
  it('accepts canonical valid input',()=>expect(travelPlanInputSchema.safeParse(valid).success).toBe(true));
  it.each([0,1,2])('accepts flexibility %i',dateFlexibilityDays=>expect(travelPlanInputSchema.safeParse({...valid,dateFlexibilityDays}).success).toBe(true));
  it.each([-1,3])('rejects flexibility %i',dateFlexibilityDays=>expect(travelPlanInputSchema.safeParse({...valid,dateFlexibilityDays}).success).toBe(false));
  it.each(['EARLY_MORNING','MORNING','LATE_MORNING','AFTERNOON','FLEXIBLE'])('accepts departure %s',departureWindow=>expect(travelPlanInputSchema.safeParse({...valid,departureWindow}).success).toBe(true));
  it('rejects arbitrary departure values',()=>expect(travelPlanInputSchema.safeParse({...valid,departureWindow:'MIDNIGHT'}).success).toBe(false));
  it.each(['COMMERCIAL_BUS','TRAIN','FLIGHT','PRIVATE_VEHICLE','UNDECIDED'])('accepts mode %s',transportMode=>expect(travelPlanInputSchema.safeParse({...valid,transportMode}).success).toBe(true));
  it('rejects arbitrary transport',()=>expect(travelPlanInputSchema.safeParse({...valid,transportMode:'BOAT'}).success).toBe(false));
  it('rejects non-boolean matching preference',()=>expect(travelPlanInputSchema.safeParse({...valid,nearbyMatchingEnabled:'true'}).success).toBe(false));
  it('rejects destination tampering as an unknown field',()=>expect(travelPlanInputSchema.safeParse({...valid,destinationCampId:crypto.randomUUID()}).success).toBe(false));
  it('allows town omission',()=>{const{originTownId,...withoutTown}=valid;expect(travelPlanInputSchema.safeParse(withoutTown).success).toBe(true)});
});
describe('travel date and expiry',()=>{
  it('rejects past and impossible dates',()=>{expect(isValidTravelDate('2020-01-01',new Date('2026-09-08T12:00:00Z'))).toBe(false);expect(isValidTravelDate('2026-02-30',new Date('2026-01-01T12:00:00Z'))).toBe(false)});
  it('accepts today in Lagos',()=>{const now=new Date('2026-09-08T12:00:00Z');expect(isValidTravelDate(lagosToday(now),now)).toBe(true)});
  it('centralizes grace-period expiry',()=>expect(calculateExpiry('2026-09-14',1).toISOString()).toBe('2026-09-15T23:00:00.000Z'));
});
