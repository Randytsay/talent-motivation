import { toErrorResponse } from '../../src/server/http';
import { createRouteHandlers } from '../../src/server/routes';

const route = createRouteHandlers();
export default toErrorResponse((request) => {
  const assessmentId = new URL(request.url).pathname.split('/').at(-1);
  return route.report(request, assessmentId ?? '');
});
