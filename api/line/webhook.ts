import { vercelWebHandler } from '../../src/server/http';
import { createLinePostCourseWebhookHandler, lineMessagingConfigFromEnv } from '../../src/server/linePostCourse';
import { createRuntime } from '../../src/server/runtime';

const runtime = createRuntime();

export default vercelWebHandler(
  createLinePostCourseWebhookHandler(runtime, lineMessagingConfigFromEnv()),
);
