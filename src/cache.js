const CACHE_DB_VER=1;
const MAINTENANCE_STEP=500;
const MAINTENANCE_COUNT=5000;

class Cache {
    constructor() {
        this.db=null;
        this.added_items_since_maintenance=0;
        if(window.config.comment_cache) {
            const open_req=indexedDB.open('hole_cache_db',CACHE_DB_VER);
            open_req.onerror=console.error.bind(console);
            open_req.onupgradeneeded=(event)=>{
                console.log('comment cache db upgrade');
                const db=event.target.result;
                const store=db.createObjectStore('comment',{
                    keyPath: 'pid',
                });
                store.createIndex('last_access','last_access',{unique: false});
            };
            open_req.onsuccess=(event)=>{
                console.log('comment cache db loaded');
                this.db=event.target.result;
                setTimeout(this.maintenance.bind(this),1);
            };
        }
    }

    get(pid,target_version) {
        return new Promise((resolve,reject)=>{
            if(!this.db)
                return resolve(null);
            const tx=this.db.transaction(['comment'],'readwrite');
            const store=tx.objectStore('comment');
            const get_req=store.get(pid);
            get_req.onsuccess=()=>{
                let res=get_req.result;
                if(!res)  {
                    console.log('cache miss');
                    resolve(null);
                } else if(target_version===res.version) { // hit
                    console.log('cache hit');
                    res.last_access=+new Date();
                    store.put(res);
                    resolve(res.data);
                } else { // expired
                    console.log('cache expired: ver',res.version,'target',target_version);
                    store.delete(pid);
                    resolve(null);
                }
            };
            get_req.onerror=reject;
        });
    }

    put(pid,target_version,data) {
        return new Promise((resolve,reject)=>{
            if(!this.db)
                return resolve();
            const tx=this.db.transaction(['comment'],'readwrite');
            const store=tx.objectStore('comment');
            store.put({
                pid: pid,
                version: target_version,
                data: data,
                last_access: +new Date(),
            });
            if(++this.added_items_since_maintenance===MAINTENANCE_STEP)
                setTimeout(this.maintenance.bind(this),1);
        });
    }

    maintenance() {
        if(!this.db)
            return;
        const tx=this.db.transaction(['comment'],'readwrite');
        const store=tx.objectStore('comment');
        let count_req=store.count();
        count_req.onsuccess=()=>{
            let count=count_req.result;
            if(count>MAINTENANCE_COUNT) {
                console.log('comment cache db maintenance',count);
                store.index('last_access').openKeyCursor().onsuccess=(e)=>{
                    let cur=e.target.result;
                    if(cur) {
                        console.log('maintenance: delete',cur);
                        store.delete(cur.primaryKey);
                        if(--count>MAINTENANCE_COUNT)
                            cur.continue();
                    }
                };
            } else {
                console.log('comment cache db not full',count);
            }
            this.added_items_since_maintenance=0;
        };
        count_req.onerror=console.error.bind(console);
    }
};

export let cache=new Cache();