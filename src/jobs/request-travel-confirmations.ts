import 'dotenv/config';
import { CircleLifecycleService } from '../circles/circle-lifecycle.service.js';
import { jobMain } from './job-runner.js';

await jobMain('travel-confirmations-request', () =>
  new CircleLifecycleService().requestConfirmations(),
);
