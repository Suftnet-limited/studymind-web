'use client';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {lecturerService} from '@/services/lecturer.service';
import {moduleKeys} from '@/services/query-keys';
export function useUpdateModule(id:string){const router=useRouter();const queryClient=useQueryClient();return useMutation({mutationFn:({title,description}:{title:string;description:string})=>lecturerService.updateModule(id,title,description),onSuccess:()=>{void queryClient.invalidateQueries({queryKey:moduleKeys.all});router.refresh();}});}
export function usePrepareCourse(id:string){return useMutation({mutationFn:()=>lecturerService.prepareCourse(id)});}
