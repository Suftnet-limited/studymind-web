/** The learner's dashboard and module page are wider (three columns: Recent list, tool, side card); the header and footer follow it so their edges line up. */
export const isWideRoute = (pathname: string | null) => !!pathname && /^\/my-learning\/?$|^\/my-learning\/modules\/[^/]+/.test(pathname);
