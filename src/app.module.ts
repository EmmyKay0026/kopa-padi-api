import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CircleLifecycleService } from "./circles/circle-lifecycle.service.js";
import {
  CircleAdminController,
  CircleController,
} from "./circles/circle.controller.js";
import { CircleService } from "./circles/circle.service.js";
import { AuthGuard } from "./common/auth.guard.js";
import { EmailService } from "./email/email.service.js";
import { GeographyController } from "./geography/geography.controller.js";
import { GeographyService } from "./geography/geography.service.js";
import {
  JourneyGuideAdminController,
  JourneyGuideController,
} from "./journey-guides/journey-guide.controller.js";
import {
  JourneyGuideResolver,
  JourneyGuideService,
} from "./journey-guides/journey-guide.service.js";
import {
  JourneyAdminController,
  JourneyController,
  JourneyShareController,
  TrustedContactController,
} from "./journeys/journey.controller.js";
import { JourneyService } from "./journeys/journey.service.js";
import {
  MatchingAdminController,
  MatchingController,
} from "./matching/matching.controller.js";
import { MatchingService } from "./matching/matching.service.js";
import { OperationsController } from "./operations/operations.controller.js";
import {
  SafetyAdminController,
  SafetyController,
} from "./safety/safety.controller.js";
import { SafetyService } from "./safety/safety.service.js";
import { TravelPlanController } from "./travel-plans/travel-plan.controller.js";
import { TravelPlanService } from "./travel-plans/travel-plan.service.js";
import { PrivateStorageService } from "./verification/storage.service.js";
import { VerificationController } from "./verification/verification.controller.js";
import { VerificationService } from "./verification/verification.service.js";

@Module({
  controllers: [
    VerificationController,
    GeographyController,
    TravelPlanController,
    MatchingController,
    MatchingAdminController,
    CircleController,
    CircleAdminController,
    JourneyController,
    TrustedContactController,
    JourneyShareController,
    JourneyAdminController,
    JourneyGuideController,
    JourneyGuideAdminController,
    SafetyController,
    SafetyAdminController,
    OperationsController,
  ],
  providers: [
    EmailService,
    PrivateStorageService,
    VerificationService,
    GeographyService,
    MatchingService,
    TravelPlanService,
    CircleService,
    CircleLifecycleService,
    JourneyGuideResolver,
    JourneyGuideService,
    JourneyService,
    SafetyService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
