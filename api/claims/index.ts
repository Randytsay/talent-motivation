import { vercelWebHandler } from '../../src/server/http';
import { createRouteHandlers } from '../../src/server/routes';

const routes = createRouteHandlers();
export default vercelWebHandler(routes.createClaim);
