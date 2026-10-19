import {connect,environment} from '../p2/support.mjs';
const check=await connect();await check.end();Object.assign(process.env,environment());
const {JourneyService}=await import('../../dist/src/journeys/journey.service.js');
await new JourneyService({}).processReminders(new Date());
process.exit(17); // Simulate abrupt exit only after the transaction was committed.
