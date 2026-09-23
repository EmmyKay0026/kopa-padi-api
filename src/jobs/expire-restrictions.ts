import'dotenv/config';import{SafetyService}from'../safety/safety.service.js';import{jobMain}from'./job-runner.js';await jobMain('restrictions-expire',()=>new SafetyService().expire());
