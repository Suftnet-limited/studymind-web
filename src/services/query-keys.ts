export const moduleKeys = { all: ['modules'] as const, indexing: (moduleId:string) => ['modules',moduleId,'indexing'] as const };
