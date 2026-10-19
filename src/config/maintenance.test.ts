import {it,expect} from 'vitest';
import {allowedDuringMaintenance} from './maintenance.js';
it('permits exact withdrawal and safety paths without prefix bypasses',()=>{
 for(const path of ['/api/auth/sign-in/email','/api/auth/sign-out','/api/journeys/sharing/revoke','/api/journeys/current/share/revoke','/api/journeys/sharing/location/revoke','/api/journeys/current/check-ins']) expect(allowedDuringMaintenance(path)).toBe(true);
 for(const path of ['/api/auth/sign-up/email','/api/auth/sign-in/email/extra','/api/journeys/current/start','/api/journeys/sharing/revoke/extra','/prefix/api/journeys/current/check-ins']) expect(allowedDuringMaintenance(path)).toBe(false);
});
