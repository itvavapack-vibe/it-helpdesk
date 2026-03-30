-- ตารางสำหรับ Change Request (FMIT 15)
CREATE TABLE public.change_requests (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    ticket_number TEXT UNIQUE NOT NULL,

    req_type TEXT NOT NULL, -- 'add', 'remove', 'change'
    req_type_other TEXT,
    department TEXT NOT NULL,
    details TEXT NOT NULL,
    reason TEXT NOT NULL,

    -- ผู็ร้องขอ (Part 1)
    requester_name TEXT NOT NULL,
    requester_position TEXT NOT NULL,
    requester_sign TEXT, -- Base64

    -- ผู็จัดการอนุมัติ (Part 1 - Manager)
    manager_name TEXT,
    manager_position TEXT,
    manager_sign TEXT, -- Base64
    manager_date TIMESTAMP WITH TIME ZONE,

    -- สถานะปัจจุบันของใบคำร้อง
    status TEXT NOT NULL DEFAULT 'Pending_Manager', -- Pending_Manager, Pending_IT, In_Progress, Pending_User_Acceptance, Completed, Rejected

    -- ข้อมูลจากแผนก IT (Part 2)
    it_received_date DATE,
    it_target_date DATE,
    it_operation_date DATE,
    
    it_approval_status TEXT, -- 'Approved', 'Rejected'
    it_reject_reason TEXT,
    
    it_manager_name TEXT,
    it_manager_position TEXT,
    it_manager_sign TEXT, -- Base64
    it_manager_date TIMESTAMP WITH TIME ZONE,
    
    it_solution TEXT,

    it_staff_name TEXT,
    it_staff_position TEXT,
    it_staff_sign TEXT, -- Base64
    it_staff_date TIMESTAMP WITH TIME ZONE,

    -- การส่งมอบ/รับทราบผล (Part 3)
    user_acceptance TEXT, -- 'Accepted', 'Rejected'
    user_reject_reason TEXT,
    user_accept_sign TEXT, -- Base64
    user_accept_date TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- สร้าง Index เพื่อให้ค้นหาข้อมูลได้เร็วขึ้น
CREATE INDEX idx_change_requests_ticket ON public.change_requests(ticket_number);
CREATE INDEX idx_change_requests_status ON public.change_requests(status);
CREATE INDEX idx_change_requests_department ON public.change_requests(department);
