import { toErrorResponse } from '../../src/server/http';
import { createRouteHandlers } from '../../src/server/routes';

const routes = createRouteHandlers();
export default toErrorResponse(async (request) => request.method === 'POST' ? routes.createAssessment(request) : routes.latestAssessment(request));
