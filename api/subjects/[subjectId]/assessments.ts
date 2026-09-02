import { vercelWebHandler } from '../../../src/server/http';
import { createRouteHandlers } from '../../../src/server/routes';

const routes = createRouteHandlers();
export default vercelWebHandler((request) => {
  const segments = new URL(request.url).pathname.split('/');
  const subjectId = segments[segments.length - 2] ?? '';
  return routes.subjectAssessments(request, subjectId);
});
