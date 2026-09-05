import { vercelWebHandler } from '../../src/server/http';
import { createLinePostCourseExperienceWebhookHandler } from '../../src/server/linePostCourseExperience';
import { lineMessagingConfigFromEnv } from '../../src/server/linePostCourse';
import { createRuntime } from '../../src/server/runtime';

const runtime = createRuntime();
const messagingConfig = lineMessagingConfigFromEnv();

if (!messagingConfig) {
  throw new Error('LINE Messaging API is not configured.');
}

export default vercelWebHandler(
  createLinePostCourseExperienceWebhookHandler(runtime, messagingConfig),
);
