'use client';
import {useMutation} from '@tanstack/react-query';
import {preparationService} from '@/services/preparation.service';
export function usePreparation(moduleId:string){
 return useMutation({mutationFn:(payload:{type:'manual'|'questions';topic:string;count:number;complexity:'simple'|'normal'|'expert'})=>preparationService.generate(moduleId,payload)});
}
